import { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../lib/prisma"
import { Comment, CommentLike, MediaType, User } from "@prisma/client"

import { io } from "../../realtime/socket"
import { NotificationService } from "../notifications/notification.service"
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors"
import { logger } from "../../lib/logger"

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

interface RequestedAnchors {
	timestamp: number | null
	timestampEnd: number | null
	page: number | null
	modelAnchor: unknown
}

const anchorsSupportedBy = (
	mediaType: MediaType,
	requested: RequestedAnchors
): RequestedAnchors => ({
	timestamp: mediaType === "VIDEO" ? requested.timestamp : null,
	timestampEnd: mediaType === "VIDEO" ? requested.timestampEnd : null,
	page: mediaType === "PDF" ? requested.page : null,
	modelAnchor: mediaType === "MODEL" ? requested.modelAnchor : null,
})

const clampToDuration = (
	seconds: number | null,
	duration: number | null
): number | null =>
	seconds === null || duration === null ? seconds : Math.min(seconds, duration)

export class CommentsService {
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

	private static async validateAnchors(
		imageVersionId: string,
		requested: RequestedAnchors
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

		const { timestamp, timestampEnd, page, modelAnchor } = anchorsSupportedBy(
			version.mediaType,
			requested
		)

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

		if (page !== null && (!Number.isInteger(page) || page < 1)) {
			throw new ValidationError("page must be a positive integer")
		}

		return {
			timestamp: clampToDuration(timestamp, version.duration),
			timestampEnd: clampToDuration(timestampEnd, version.duration),
			page,
			modelAnchor:
				modelAnchor === null || modelAnchor === undefined
					? null
					: this.parseModelAnchor(modelAnchor),
		}
	}

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
		const anchors = await this.validateAnchors(data.imageVersionId, {
			timestamp: data.timestamp ?? null,
			timestampEnd: data.timestampEnd ?? null,
			page: data.page ?? null,
			modelAnchor: data.modelAnchor ?? null,
		})

		if (data.parentId) {
			const parent = await prisma.comment.findUnique({
				where: { id: data.parentId },
				select: { imageVersionId: true },
			})
			if (!parent || parent.imageVersionId !== data.imageVersionId) {
				throw new NotFoundError("Parent comment not found")
			}
		}

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

		io.to(`imageVersion:${data.imageVersionId}`).emit(
			"new-comment",
			commentWithExtras
		)

		await this.handleCommentNotifications(comment, data.userId)

		return comment
	}

	static async getCommentsByImageVersionId(
		imageVersionId: string,
		currentUserId?: string
	): Promise<CommentWithLikesAndUser[]> {
		const comments = await prisma.comment.findMany({
			where: { imageVersionId, parentId: null },
			include: {
				user: true,
				likes: true,
				replies: {
					include: { user: true, likes: true },
					orderBy: { createdAt: "asc" },
				},
			},
			orderBy: { createdAt: "desc" },
		})

		const likedByCaller = (likes: { userId: string }[]): boolean =>
			!!currentUserId && likes.some((like) => like.userId === currentUserId)

		return comments.map((comment) => ({
			...comment,
			likeCount: comment.likes.length,
			isLikedByCurrentUser: likedByCaller(comment.likes),
			replies: comment.replies?.map((reply) => ({
				...reply,
				likeCount: reply.likes.length,
				isLikedByCurrentUser: likedByCaller(reply.likes),
			})),
		}))
	}

	static async updateComment(
		commentId: string,
		data: {
			content: string
			resolved?: boolean
		},
		userId: string
	): Promise<Comment> {
		const existingComment = await prisma.comment.findFirst({
			where: { id: commentId, userId },
		})

		if (!existingComment) {
			throw new ForbiddenError(
				"Comment not found or you don't have permission to update it"
			)
		}

		const updatedComment = await prisma.comment.update({
			where: { id: commentId },
			data: {
				content: data.content,
				resolved: data.resolved ?? existingComment.resolved,
			},
			include: { user: true, likes: true },
		})

		io.to(`imageVersion:${existingComment.imageVersionId}`).emit(
			"comment-updated",
			{
				...updatedComment,
				imageVersionId: existingComment.imageVersionId,
			}
		)

		return updatedComment
	}

	static async deleteComment(commentId: string, userId: string): Promise<void> {
		const comment = await prisma.comment.findFirst({
			where: { id: commentId, userId },
			select: { id: true, imageVersionId: true },
		})

		if (!comment) {
			throw new ForbiddenError(
				"Comment not found or you don't have permission to delete it"
			)
		}

		await prisma.comment.delete({ where: { id: commentId } })

		io.to(`imageVersion:${comment.imageVersionId}`).emit("comment-deleted", {
			id: commentId,
			imageVersionId: comment.imageVersionId,
		})
	}

	static async toggleLike(
		commentId: string,
		userId: string
	): Promise<{ liked: boolean; count: number }> {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: { userId: true, imageVersionId: true },
		})
		if (!comment) throw new NotFoundError("Comment not found")

		const { liked, count } = await prisma.$transaction(async (tx) => {
			const removed = await tx.commentLike.deleteMany({
				where: { commentId, userId },
			})

			if (removed.count === 0) {
				await tx.commentLike.create({ data: { commentId, userId } })
			}

			return {
				liked: removed.count === 0,
				count: await tx.commentLike.count({ where: { commentId } }),
			}
		})

		io.to(`imageVersion:${comment.imageVersionId}`).emit(
			"comment-like-updated",
			{
				id: commentId,
				liked,
				count,
				userId,
				imageVersionId: comment.imageVersionId,
			}
		)

		if (liked && comment.userId !== userId) {
			await NotificationService.createNotification({
				userId: comment.userId,
				content: "Someone liked your comment",
				metadata: {
					type: "like",
					commentId,
					imageVersionId: comment.imageVersionId,
				},
			}).catch((error) =>
				logger.error("Comment like notification failed", error)
			)
		}

		return { liked, count }
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

	private static async handleCommentNotifications(
		comment: Comment & { user: Omit<User, "password"> },
		currentUserId: string
	): Promise<void> {
		try {
			if (comment.parentId) {
				const parentComment = await prisma.comment.findUnique({
					where: { id: comment.parentId },
					select: { userId: true },
				})

				if (parentComment && parentComment.userId !== currentUserId) {
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
				const imageVersion = await prisma.imageVersion.findUnique({
					where: { id: comment.imageVersionId },
					select: { imageId: true },
				})

				if (imageVersion) {
					const image = await prisma.image.findUnique({
						where: { id: imageVersion.imageId },
						select: { projectId: true, name: true },
					})

					if (image) {
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
					}
				}
			}
		} catch (error) {
			logger.error("Comment notification fan-out failed", error, {
				commentId: comment.id,
			})
		}
	}
}
