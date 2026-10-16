import { JsonValue } from "@prisma/client/runtime/library"
import {
	Comment,
	CommentAttachment,
	MediaType,
	ProjectRole,
} from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors"
import { logger } from "../../lib/logger"
import { MAX_ATTACHMENTS_PER_COMMENT } from "../../middleware/upload.middleware"
import { io, internalVersionRoom } from "../../realtime/socket"
import { NotificationService } from "../notifications/notification.service"
import { roleMeets } from "../projects/access"
import { storage } from "../../storage"
import { forgetProjectAssets } from "../media/media-access.service"
import { PageRequest, Paginated, paginated } from "../../lib/pagination"

export const DEFAULT_COMMENT_PAGE_SIZE = 50

export const INTERNAL_COMMENT_MIN_ROLE: ProjectRole = "EDITOR"

export const INTERNAL_COMMENT_ROLES: ProjectRole[] = ["EDITOR", "OWNER"]

export const canSeeInternalComments = (role: ProjectRole | null): boolean =>
	roleMeets(role, INTERNAL_COMMENT_MIN_ROLE)

const commentRoom = (imageVersionId: string, internal: boolean): string =>
	internal
		? internalVersionRoom(imageVersionId)
		: `imageVersion:${imageVersionId}`

const MENTION_INCLUDE = {
	select: {
		userId: true,
		user: { select: { name: true } },
	},
} as const

const COMMENT_AUTHOR_SELECT = {
	select: { id: true, name: true, email: true, avatarUrl: true },
} as const

export type CommentAuthor = {
	id: string
	name: string | null
	email: string
	avatarUrl: string | null
}

type CommentMentionSummary = {
	userId: string
	user: { name: string | null }
}

type CommentWithLikesAndUser = Comment & {
	user: CommentAuthor
	likeCount: number
	isLikedByCurrentUser: boolean
	mentions?: CommentMentionSummary[]
	replies?: CommentWithLikesAndUser[]
}

const LIKE_SUMMARY = {
	_count: { select: { likes: true } },
} as const

const callerLike = (userId?: string) => ({
	likes: {
		where: { userId: userId ?? "" },
		select: { id: true },
		take: 1,
	},
})

type LikeAnnotated = {
	_count: { likes: number }
	likes: { id: string }[]
}

const withLikeCount = <T extends { _count: { likes: number } }>(row: T) => {
	const { _count, ...rest } = row
	return { ...rest, likeCount: _count.likes }
}

const withLikeSummary = <T extends LikeAnnotated>(row: T) => {
	const { _count, likes, ...rest } = row
	return {
		...rest,
		likeCount: _count.likes,
		isLikedByCurrentUser: likes.length > 0,
	}
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

interface VersionContext {
	mediaType: MediaType
	duration: number | null
	imageId: string
	imageName: string
	projectId: string
}

const versionContext = async (
	imageVersionId: string
): Promise<VersionContext> => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: imageVersionId },
		select: {
			mediaType: true,
			duration: true,
			image: { select: { id: true, name: true, projectId: true } },
		},
	})
	if (!version) throw new NotFoundError("Image version not found")
	return {
		mediaType: version.mediaType,
		duration: version.duration,
		imageId: version.image.id,
		imageName: version.image.name,
		projectId: version.image.projectId,
	}
}

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

	private static validateAnchors(
		version: Pick<VersionContext, "mediaType" | "duration">,
		requested: RequestedAnchors
	): {
		timestamp: number | null
		timestampEnd: number | null
		page: number | null
		modelAnchor: ModelAnchor | null
	} {
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

	private static async mentionableMembers(
		projectId: string,
		authorId: string,
		requestedUserIds: string[]
	): Promise<string[]> {
		const candidates = Array.from(new Set(requestedUserIds)).filter(
			(id) => id !== authorId
		)
		if (candidates.length === 0) return []

		const members = await prisma.projectMember.findMany({
			where: { projectId, userId: { in: candidates } },
			select: { userId: true },
		})
		return members.map((member) => member.userId)
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
		mentionedUserIds?: string[]
		internal?: boolean
		authorRole?: ProjectRole | null
	}): Promise<Comment> {
		const version = await versionContext(data.imageVersionId)
		const anchors = this.validateAnchors(version, {
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

		if (data.internal && !canSeeInternalComments(data.authorRole ?? null)) {
			throw new ForbiddenError(
				"Only the internal team can post internal comments"
			)
		}

		const mentionedUserIds = await this.mentionableMembers(
			version.projectId,
			data.userId,
			data.mentionedUserIds ?? []
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
				internal: !!data.internal,
				mentions: {
					create: mentionedUserIds.map((userId) => ({ userId })),
				},
			},
			include: {
				user: COMMENT_AUTHOR_SELECT,
				mentions: MENTION_INCLUDE,
			},
		})

		const commentWithExtras = {
			...comment,
			likeCount: 0,
			isLikedByCurrentUser: false,
		}

		io.to(commentRoom(data.imageVersionId, comment.internal)).emit(
			"new-comment",
			commentWithExtras
		)

		await this.handleCommentNotifications(
			comment,
			data.userId,
			version,
			mentionedUserIds
		)

		return comment
	}

	static async attachToComment(
		commentId: string,
		userId: string,
		files: { url: string; fileName: string; mimeType: string }[]
	): Promise<CommentAttachment[]> {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: {
				userId: true,
				imageVersionId: true,
				internal: true,
				_count: { select: { attachments: true } },
			},
		})

		if (!comment) throw new NotFoundError("Comment not found")
		if (comment.userId !== userId) {
			throw new ForbiddenError("Only the comment author can attach files")
		}
		if (comment._count.attachments + files.length > MAX_ATTACHMENTS_PER_COMMENT) {
			throw new ValidationError(
				`A comment can hold at most ${MAX_ATTACHMENTS_PER_COMMENT} attachments`
			)
		}

		await prisma.commentAttachment.createMany({
			data: files.map((file) => ({ ...file, commentId })),
		})

		const attachments = await prisma.commentAttachment.findMany({
			where: { commentId },
			orderBy: { createdAt: "asc" },
		})

		io.to(commentRoom(comment.imageVersionId, comment.internal)).emit(
			"comment-updated",
			{
				id: commentId,
				imageVersionId: comment.imageVersionId,
				attachments,
			}
		)

		return attachments
	}

	static async getCommentsByImageVersionId(
		imageVersionId: string,
		currentUserId?: string,
		callerRole?: ProjectRole | null,
		page: PageRequest = { page: 1, pageSize: DEFAULT_COMMENT_PAGE_SIZE }
	): Promise<Paginated<CommentWithLikesAndUser>> {
		const internalVisible = canSeeInternalComments(callerRole ?? null)
		const visibility = internalVisible ? {} : { internal: false }
		const where = { imageVersionId, parentId: null, ...visibility }

		const [total, comments] = await Promise.all([
			prisma.comment.count({ where }),
			prisma.comment.findMany({
				where,
				include: {
					user: COMMENT_AUTHOR_SELECT,
					mentions: MENTION_INCLUDE,
					attachments: true,
					...LIKE_SUMMARY,
					...callerLike(currentUserId),
					replies: {
						where: visibility,
						include: {
							user: COMMENT_AUTHOR_SELECT,
							mentions: MENTION_INCLUDE,
							attachments: true,
							...LIKE_SUMMARY,
							...callerLike(currentUserId),
						},
						orderBy: { createdAt: "asc" },
					},
				},
				orderBy: { createdAt: "desc" },
				skip: (page.page - 1) * page.pageSize,
				take: page.pageSize,
			}),
		])

		const items = comments.map((comment) => {
			const { replies, ...top } = comment
			return {
				...withLikeSummary(top),
				replies: replies.map(withLikeSummary),
			} as CommentWithLikesAndUser
		})

		return paginated(items, total, page)
	}

	static async updateComment(
		commentId: string,
		data: { content: string },
		userId: string
	): Promise<Comment> {
		const existingComment = await prisma.comment.findFirst({
			where: { id: commentId, userId },
		})

		if (!existingComment) {
			throw new ForbiddenError(
				"Only the comment author can edit its text"
			)
		}

		const updatedComment = await prisma.comment.update({
			where: { id: commentId },
			data: { content: data.content },
			include: { user: COMMENT_AUTHOR_SELECT, ...LIKE_SUMMARY },
		})

		io.to(
			commentRoom(existingComment.imageVersionId, existingComment.internal)
		).emit("comment-updated", {
			...withLikeCount(updatedComment),
			imageVersionId: existingComment.imageVersionId,
		})

		return withLikeCount(updatedComment)
	}

	static async deleteComment(
		commentId: string,
		userId: string,
		callerRole?: ProjectRole | null
	): Promise<{ moderated: boolean }> {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: {
				id: true,
				userId: true,
				imageVersionId: true,
				internal: true,
				attachments: { select: { url: true } },
			},
		})

		if (!comment) throw new NotFoundError("Comment not found")

		const isAuthor = comment.userId === userId
		const moderated = !isAuthor && roleMeets(callerRole ?? null, "OWNER")

		if (!isAuthor && !moderated) {
			throw new ForbiddenError(
				"Only the comment author or a project owner can delete it"
			)
		}

		await prisma.comment.delete({ where: { id: commentId } })

		const attachmentUrls = comment.attachments.map(
			(attachment) => attachment.url
		)
		if (attachmentUrls.length > 0) {
			await forgetProjectAssets(attachmentUrls)
			await Promise.all(attachmentUrls.map((url) => storage.remove(url)))
		}

		io.to(commentRoom(comment.imageVersionId, comment.internal)).emit(
			"comment-deleted",
			{
				id: commentId,
				imageVersionId: comment.imageVersionId,
			}
		)

		return { moderated }
	}

	static async toggleLike(
		commentId: string,
		userId: string
	): Promise<{ liked: boolean; count: number }> {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: { userId: true, imageVersionId: true, internal: true },
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

		io.to(commentRoom(comment.imageVersionId, comment.internal)).emit(
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
		userId: string,
		callerRole?: ProjectRole | null
	): Promise<{ resolved: boolean; moderated: boolean }> {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: {
				userId: true,
				resolved: true,
				imageVersionId: true,
				internal: true,
			},
		})

		if (!comment) throw new NotFoundError("Comment not found")

		const isAuthor = comment.userId === userId
		const moderated = !isAuthor && roleMeets(callerRole ?? null, "EDITOR")

		if (!isAuthor && !moderated) {
			throw new ForbiddenError(
				"Only the comment author or a project editor can resolve it"
			)
		}

		const updated = await prisma.comment.update({
			where: { id: commentId },
			data: { resolved: !comment.resolved },
			include: { user: COMMENT_AUTHOR_SELECT, ...LIKE_SUMMARY },
		})

		io.to(commentRoom(comment.imageVersionId, comment.internal)).emit(
			"comment-updated",
			{
				...withLikeCount(updated),
				imageVersionId: comment.imageVersionId,
			}
		)

		return { resolved: updated.resolved, moderated }
	}

	private static async internalOnlyMentions(
		projectId: string,
		mentionedUserIds: string[]
	): Promise<string[]> {
		if (mentionedUserIds.length === 0) return []
		const members = await prisma.projectMember.findMany({
			where: {
				projectId,
				userId: { in: mentionedUserIds },
				role: { in: INTERNAL_COMMENT_ROLES },
			},
			select: { userId: true },
		})
		return members.map((member) => member.userId)
	}

	private static async handleCommentNotifications(
		comment: Comment & { user: CommentAuthor },
		currentUserId: string,
		version: VersionContext,
		mentionedUserIds: string[] = []
	): Promise<void> {
		try {
			const authorName = comment.user.name || "Someone"
			const recipients = comment.internal
				? await this.internalOnlyMentions(version.projectId, mentionedUserIds)
				: mentionedUserIds

			await Promise.all(
				recipients.map((userId) =>
					NotificationService.createNotification({
						userId,
						content: `${authorName} mentioned you in a comment`,
						metadata: {
							type: "mention",
							commentId: comment.id,
							imageVersionId: comment.imageVersionId,
						},
					}).catch((error) =>
						logger.error("Mention notification failed", error, {
							commentId: comment.id,
						})
					)
				)
			)

			if (comment.parentId) {
				const parentComment = await prisma.comment.findUnique({
					where: { id: comment.parentId },
					select: { userId: true },
				})
				const parentAuthorMayKnow =
					!!parentComment &&
					(!comment.internal ||
						(
							await this.internalOnlyMentions(version.projectId, [
								parentComment.userId,
							])
						).length > 0)

				if (
					parentComment &&
					parentAuthorMayKnow &&
					parentComment.userId !== currentUserId &&
					!recipients.includes(parentComment.userId)
				) {
					await NotificationService.createNotification({
						userId: parentComment.userId,
						content: `${authorName} replied to your comment`,
						metadata: {
							type: "comment_reply",
							commentId: comment.id,
							imageVersionId: comment.imageVersionId,
						},
					})
				}
			} else {
				NotificationService.createProjectNotification({
					projectId: version.projectId,
					content: comment.internal
						? `${authorName} left an internal note on "${version.imageName}"`
						: `${authorName} commented on image "${version.imageName}"`,
					excludeUserIds: [currentUserId, ...recipients],
					...(comment.internal ? { onlyRoles: INTERNAL_COMMENT_ROLES } : {}),
					metadata: {
						type: "new_comment",
						commentId: comment.id,
						imageVersionId: comment.imageVersionId,
						imageId: version.imageId,
						projectId: version.projectId,
					},
				})
			}
		} catch (error) {
			logger.error("Comment notification fan-out failed", error, {
				commentId: comment.id,
			})
		}
	}
}
