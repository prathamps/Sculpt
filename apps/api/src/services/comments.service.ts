import { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../lib/prisma"
import { Comment, CommentLike, User } from "@prisma/client"

import { io } from "../index"
import { NotificationService } from "./notification.service"

type CommentWithLikesAndUser = Comment & {
	likes: CommentLike[]
	user: User
	likeCount?: number
	isLikedByCurrentUser?: boolean
	replies?: CommentWithLikesAndUser[]
}

export class CommentsService {
	// Create a new comment
	static async createComment(data: {
		content: string
		imageVersionId: string
		userId: string
		parentId?: string | null
		annotation?: JsonValue | null
	}): Promise<Comment> {
		try {
			console.log("=== COMMENT CREATION STARTED ===")
			console.log("Data received:", {
				content: data.content,
				imageVersionId: data.imageVersionId,
				userId: data.userId,
				parentId: data.parentId,
				hasAnnotation: !!data.annotation,
			})

			const comment = await prisma.comment.create({
				data: {
					content: data.content,
					imageVersionId: data.imageVersionId,
					userId: data.userId,
					parentId: data.parentId || null,
					annotation: data.annotation,
				},
				include: {
					user: true,
					likes: true,
				},
			})

			console.log(
				`Created new comment: ${comment.id} for image version: ${data.imageVersionId}`
			)

			// Prepare comment data for real-time updates with like info
			const commentWithExtras = {
				...comment,
				likeCount: 0,
				isLikedByCurrentUser: false,
			}

			// Send real-time update via Socket.io
			try {
				console.log(
					`Emitting new-comment event to imageVersion:${data.imageVersionId}`
				)
				console.log("Active rooms:", io.sockets.adapter.rooms)
				console.log("Target room:", `imageVersion:${data.imageVersionId}`)
				console.log(
					"Comment data being sent:",
					JSON.stringify(commentWithExtras, null, 2)
				)

				io.to(`imageVersion:${data.imageVersionId}`).emit(
					"new-comment",
					commentWithExtras
				)

				console.log("Event emitted successfully")
			} catch (socketError) {
				console.error(`Socket error when emitting new comment: ${socketError}`)
			}

			// Create notifications for relevant users
			await this.handleCommentNotifications(comment, data.userId)

			console.log("=== COMMENT CREATION COMPLETED ===")
			return comment
		} catch (error) {
			console.error("Error creating comment:", error)
			throw error
		}
	}

	// Get comments for an image version
	static async getCommentsByImageVersionId(
		imageVersionId: string,
		currentUserId?: string
	): Promise<CommentWithLikesAndUser[]> {
		try {
			// Get comments directly from the database for consistency
			const comments = await prisma.comment.findMany({
				where: {
					imageVersionId,
					parentId: null, // Only get top-level comments
				},
				include: {
					user: true,
					likes: true,
					replies: {
						include: {
							user: true,
							likes: true,
						},
					},
				},
				orderBy: {
					createdAt: "desc",
				},
			})

			// Transform comments to include like info
			const transformedComments = comments.map((comment) => {
				const likeCount = comment.likes.length
				const isLikedByCurrentUser = currentUserId
					? comment.likes.some((like) => like.userId === currentUserId)
					: false

				// Transform replies as well
				const transformedReplies = comment.replies?.map((reply) => {
					const replyLikeCount = reply.likes.length
					const replyIsLikedByCurrentUser = currentUserId
						? reply.likes.some((like) => like.userId === currentUserId)
						: false

					return {
						...reply,
						likeCount: replyLikeCount,
						isLikedByCurrentUser: replyIsLikedByCurrentUser,
					}
				})

				return {
					...comment,
					likeCount,
					isLikedByCurrentUser,
					replies: transformedReplies,
				}
			})
			return transformedComments
		} catch (error) {
			console.error("Error getting comments:", error)
			throw error
		}
	}

	// Update a comment
	static async updateComment(
		commentId: string,
		data: {
			content: string
			resolved?: boolean
		},
		userId: string
	): Promise<Comment> {
		try {
			// Verify the comment belongs to the user
			const existingComment = await prisma.comment.findFirst({
				where: {
					id: commentId,
					userId,
				},
			})

			if (!existingComment) {
				throw new Error(
					"Comment not found or you don't have permission to update it"
				)
			}

			const updatedComment = await prisma.comment.update({
				where: {
					id: commentId,
				},
				data: {
					content: data.content,
					resolved:
						data.resolved !== undefined
							? data.resolved
							: existingComment.resolved,
				},
				include: {
					user: true,
					likes: true,
				},
			})

			// Send real-time update with imageVersionId included
			console.log(
				`Emitting comment-updated event to imageVersion:${existingComment.imageVersionId}`
			)
			io.to(`imageVersion:${existingComment.imageVersionId}`).emit(
				"comment-updated",
				{
					...updatedComment,
					imageVersionId: existingComment.imageVersionId,
				}
			)

			return updatedComment
		} catch (error) {
			console.error("Error updating comment:", error)
			throw error
		}
	}

	// Delete a comment
	static async deleteComment(commentId: string, userId: string): Promise<void> {
		try {
			// Verify the comment belongs to the user
			const comment = await prisma.comment.findFirst({
				where: {
					id: commentId,
					userId,
				},
				select: {
					id: true,
					imageVersionId: true,
				},
			})

			if (!comment) {
				throw new Error(
					"Comment not found or you don't have permission to delete it"
				)
			}

			// Delete from database (cascades to likes via Prisma schema)
			await prisma.comment.delete({
				where: {
					id: commentId,
				},
			})

			// Send real-time update with explicit imageVersionId
			console.log(
				`Emitting comment-deleted event to imageVersion:${comment.imageVersionId}`
			)
			io.to(`imageVersion:${comment.imageVersionId}`).emit("comment-deleted", {
				id: commentId,
				imageVersionId: comment.imageVersionId,
			})
		} catch (error) {
			console.error("Error deleting comment:", error)
			throw error
		}
	}

	// Like or unlike a comment
	static async toggleLike(
		commentId: string,
		userId: string
	): Promise<{ liked: boolean; count: number }> {
		try {
			// Check if like exists
			const existingLike = await prisma.commentLike.findFirst({
				where: {
					commentId,
					userId,
				},
			})

			let liked: boolean

			if (existingLike) {
				// Unlike the comment
				await prisma.commentLike.delete({
					where: {
						id: existingLike.id,
					},
				})
				liked = false
			} else {
				// Like the comment
				await prisma.commentLike.create({
					data: {
						commentId,
						userId,
					},
				})

				// Get comment info to send notifications
				const comment = await prisma.comment.findUnique({
					where: { id: commentId },
					select: { userId: true, imageVersionId: true },
				})

				liked = true

				// Send notification to comment author (if not self-like)
				if (comment && comment.userId !== userId) {
					await NotificationService.createNotification({
						userId: comment.userId,
						content: "Someone liked your comment",
						metadata: {
							type: "like",
							commentId,
							imageVersionId: comment.imageVersionId,
						},
					})
				}
			}

			// Get updated like count
			const likeCount = await prisma.commentLike.count({
				where: {
					commentId,
				},
			})

			// Get the comment to send the imageVersionId
			const commentData = await prisma.comment.findUnique({
				where: { id: commentId },
				select: { imageVersionId: true },
			})

			if (commentData) {
				console.log(
					`Emitting comment-like-updated event to imageVersion:${commentData.imageVersionId}`
				)
				io.to(`imageVersion:${commentData.imageVersionId}`).emit(
					"comment-like-updated",
					{
						id: commentId,
						liked,
						count: likeCount,
						userId,
						imageVersionId: commentData.imageVersionId,
					}
				)
			}

			return { liked, count: likeCount }
		} catch (error) {
			console.error("Error toggling comment like:", error)
			throw error
		}
	}

	// Helper method to create notifications for comments
	private static async handleCommentNotifications(
		comment: Comment & { user: User },
		currentUserId: string
	): Promise<void> {
		try {
			console.log(`Creating notifications for comment ${comment.id}`)

			if (comment.parentId) {
				// This is a reply - notify the parent comment author
				const parentComment = await prisma.comment.findUnique({
					where: { id: comment.parentId },
					select: { userId: true },
				})

				if (parentComment && parentComment.userId !== currentUserId) {
					console.log(
						`Creating reply notification for user ${parentComment.userId}`
					)

					await NotificationService.createNotification({
						userId: parentComment.userId,
						content: `${
							comment.user.name || "Someone"
						} replied to your comment`,
						metadata: {
							type: "comment_reply",
							commentId: comment.id,
							imageVersionId: comment.imageVersionId,
						},
					})
				}
			} else {
				// This is a new comment - notify project members
				console.log(
					`Finding image version for comment: ${comment.imageVersionId}`
				)

				const imageVersion = await prisma.imageVersion.findUnique({
					where: { id: comment.imageVersionId },
					select: { imageId: true },
				})

				if (imageVersion) {
					console.log(
						`Found image version with image ID: ${imageVersion.imageId}`
					)

					const image = await prisma.image.findUnique({
						where: { id: imageVersion.imageId },
						select: { projectId: true, name: true },
					})

					if (image) {
						console.log(
							`Found image ${image.name} in project: ${image.projectId}`
						)

						// Create project notification (excluding the commenter)
						await NotificationService.createProjectNotification({
							projectId: image.projectId,
							content: `${comment.user.name || "Someone"} commented on image "${
								image.name
							}"`,
							excludeUserId: currentUserId,
							metadata: {
								type: "new_comment",
								commentId: comment.id,
								imageVersionId: comment.imageVersionId,
								imageId: imageVersion.imageId,
								projectId: image.projectId,
							},
						})

						console.log(
							`Created project notification for project ${image.projectId}`
						)
					}
				}
			}
		} catch (error) {
			console.error("Error creating comment notifications:", error)
			// Don't throw here, as this is just a helper method
		}
	}
}
