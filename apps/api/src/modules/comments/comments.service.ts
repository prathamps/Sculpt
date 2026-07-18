import { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../lib/prisma"
import { Comment, CommentLike, User } from "@prisma/client"

import { io } from "../../realtime/socket"
import { NotificationService } from "../notifications/notification.service"
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors"

type CommentWithLikesAndUser = Comment & {
	likes: CommentLike[]
	user: Omit<User, "password">
	likeCount?: number
	isLikedByCurrentUser?: boolean
	replies?: CommentWithLikesAndUser[]
}

type Vec3 = [number, number, number]

type ModelAnchor = {
	position: Vec3
	normal?: Vec3
	camera?: { position: Vec3; target: Vec3 }
}

const asVec3 = (value: unknown): Vec3 | null =>
	Array.isArray(value) &&
	value.length === 3 &&
	value.every((n) => typeof n === "number" && Number.isFinite(n))
		? (value as Vec3)
		: null

export class CommentsService {
	// Rebuilt from validated fields so unvalidated client JSON never reaches
	// the database.
	private static parseModelAnchor(value: unknown): ModelAnchor {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new ValidationError("modelAnchor must be an object")
		}
		const raw = value as Record<string, unknown>
		const position = asVec3(raw.position)
		if (!position) {
			throw new ValidationError(
				"modelAnchor.position must be an [x, y, z] array of finite numbers"
			)
		}
		const anchor: ModelAnchor = { position }
		if (raw.normal !== undefined && raw.normal !== null) {
			const normal = asVec3(raw.normal)
			if (!normal) {
				throw new ValidationError(
					"modelAnchor.normal must be an [x, y, z] array of finite numbers"
				)
			}
			anchor.normal = normal
		}
		if (raw.camera !== undefined && raw.camera !== null) {
			const camera = raw.camera as Record<string, unknown>
			const cameraPosition = asVec3(camera?.position)
			const target = asVec3(camera?.target)
			if (!cameraPosition || !target) {
				throw new ValidationError(
					"modelAnchor.camera must have position and target [x, y, z] arrays"
				)
			}
			anchor.camera = { position: cameraPosition, target }
		}
		return anchor
	}

	// Anchors are media-type dependent: timestamps only make sense on videos,
	// page only on PDFs, modelAnchor only on 3D models. Out-of-range timestamps
	// are clamped rather than rejected because client-measured playhead floats
	// can exceed the stored duration by rounding, and duration is nullable.
	private static async validateAnchors(
		imageVersionId: string,
		timestamp: number | null,
		timestampEnd: number | null,
		page: number | null,
		modelAnchor: unknown
	): Promise<{
		timestamp: number | null
		timestampEnd: number | null
		page: number | null
		modelAnchor: ModelAnchor | null
	}> {
		const version = await prisma.imageVersion.findUnique({
			where: { id: imageVersionId },
			select: { mediaType: true, duration: true },
		})
		if (!version) throw new NotFoundError("Image version not found")

		if (version.mediaType !== "VIDEO") {
			timestamp = null
			timestampEnd = null
		}
		if (version.mediaType !== "PDF") {
			page = null
		}
		if (version.mediaType !== "MODEL") {
			modelAnchor = null
		}

		if (timestamp !== null && (!Number.isFinite(timestamp) || timestamp < 0)) {
			throw new ValidationError("timestamp must be a non-negative number")
		}
		if (timestampEnd !== null) {
			if (!Number.isFinite(timestampEnd) || timestampEnd < 0) {
				throw new ValidationError(
					"timestampEnd must be a non-negative number"
				)
			}
			if (timestamp === null) {
				throw new ValidationError("timestampEnd requires a timestamp")
			}
			if (timestampEnd < timestamp) {
				throw new ValidationError(
					"timestampEnd must not be before timestamp"
				)
			}
		}
		if (version.duration !== null) {
			if (timestamp !== null) timestamp = Math.min(timestamp, version.duration)
			if (timestampEnd !== null) {
				timestampEnd = Math.min(timestampEnd, version.duration)
			}
		}

		if (page !== null && (!Number.isInteger(page) || page < 1)) {
			throw new ValidationError("page must be a positive integer")
		}

		return {
			timestamp,
			timestampEnd,
			page,
			modelAnchor:
				modelAnchor === null || modelAnchor === undefined
					? null
					: this.parseModelAnchor(modelAnchor),
		}
	}

	// Create a new comment
	static async createComment(data: {
		content: string
		imageVersionId: string
		userId: string
		parentId?: string | null
		annotation?: JsonValue | null
		timestamp?: number | null
		timestampEnd?: number | null
		page?: number | null
		modelAnchor?: unknown
	}): Promise<Comment> {
		const anchors = await this.validateAnchors(
			data.imageVersionId,
			data.timestamp ?? null,
			data.timestampEnd ?? null,
			data.page ?? null,
			data.modelAnchor ?? null
		)

		const comment = await prisma.comment.create({
			data: {
				content: data.content,
				imageVersionId: data.imageVersionId,
				userId: data.userId,
				parentId: data.parentId || null,
				annotation: data.annotation,
				timestamp: anchors.timestamp,
				timestampEnd: anchors.timestampEnd,
				page: anchors.page,
				modelAnchor: anchors.modelAnchor ?? undefined,
			},
			include: {
				user: true,
				likes: true,
			},
		})

		const commentWithExtras = {
			...comment,
			likeCount: 0,
			isLikedByCurrentUser: false,
		}

		try {
			io.to(`imageVersion:${data.imageVersionId}`).emit(
				"new-comment",
				commentWithExtras
			)
		} catch (socketError) {
			console.error(`Socket error when emitting new comment: ${socketError}`)
		}

		await this.handleCommentNotifications(comment, data.userId)

		return comment
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
				throw new ForbiddenError(
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

	static async toggleResolved(
		commentId: string,
		userId: string
	): Promise<{ resolved: boolean }> {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: { userId: true, resolved: true, imageVersionId: true },
		})

		if (!comment) throw new NotFoundError("Comment not found")
		if (comment.userId !== userId) {
			throw new ForbiddenError("Only the comment author can resolve it")
		}

		const updated = await prisma.comment.update({
			where: { id: commentId },
			data: { resolved: !comment.resolved },
			include: { user: true, likes: true },
		})

		io.to(`imageVersion:${comment.imageVersionId}`).emit("comment-updated", {
			...updated,
			imageVersionId: comment.imageVersionId,
		})

		return { resolved: updated.resolved }
	}

	// Helper method to create notifications for comments
	private static async handleCommentNotifications(
		comment: Comment & { user: Omit<User, "password"> },
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
