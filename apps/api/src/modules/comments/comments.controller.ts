import { Request, Response } from "express"
import * as commentsService from "./comments.service"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { respondWithError } from "../../lib/http"
import { ValidationError } from "../../lib/errors"
import { storage } from "../../storage"
import {
	forgetProjectAssets,
	recordProjectAssets,
} from "../media/media-access.service"
import { recordAudit } from "../audit/audit.service"
import { requestedPage } from "../../lib/pagination"

export const listComments = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId, role } = authorizedScope(res)
		const comments = await commentsService.getCommentsByImageVersionId(
			req.params.imageVersionId,
			userId,
			role,
			requestedPage(req.query)
		)
		res.status(200).json(comments)
	} catch (error) {
		respondWithError(res, error, "list comments")
	}
}

export const createComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId, role, projectId } = authorizedScope(res)
		const {
			content,
			parentId,
			annotation,
			timestamp,
			timestampEnd,
			page,
			modelAnchor,
			mentionedUserIds,
			internal,
		} = req.body

		const comment = await commentsService.createComment({
			content,
			imageVersionId: req.params.imageVersionId,
			userId,
			parentId: parentId || null,
			annotation: annotation || null,
			timestamp: typeof timestamp === "number" ? timestamp : null,
			timestampEnd: typeof timestampEnd === "number" ? timestampEnd : null,
			page: typeof page === "number" ? page : null,
			modelAnchor: modelAnchor ?? null,
			mentionedUserIds: Array.isArray(mentionedUserIds)
				? mentionedUserIds
				: [],
			internal: internal === true,
			authorRole: role,
		})
		await recordAudit({
			action: "comment.created",
			targetType: "comment",
			targetId: comment.id,
			actorId: userId,
			metadata: {
				projectId,
				imageVersionId: req.params.imageVersionId,
				parentId: comment.parentId,
				internal: comment.internal,
			},
		})
		res.status(201).json(comment)
	} catch (error) {
		respondWithError(res, error, "create comment")
	}
}

export const attachToComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	const stored: string[] = []
	try {
		const { userId, projectId } = authorizedScope(res)
		const files = Array.isArray(req.files) ? req.files : []
		if (files.length === 0) {
			throw new ValidationError("Choose at least one file to attach")
		}
		const imageVersionId = await commentsService.versionIdOfComment(
			req.params.commentId
		)

		const uploaded = []
		for (const file of files) {
			const url = await storage.store({
				path: file.path,
				originalName: file.originalname,
				mimeType: file.mimetype,
			})
			stored.push(url)
			uploaded.push({
				url,
				fileName: file.originalname,
				mimeType: file.mimetype,
			})
		}

		await recordProjectAssets(
			stored.map((url) => ({ url, kind: "ATTACHMENT" as const, imageVersionId })),
			projectId
		)

		const attachments = await commentsService.attachToComment(
			req.params.commentId,
			userId,
			uploaded
		)
		await recordAudit({
			action: "comment.attachments_added",
			targetType: "comment",
			targetId: req.params.commentId,
			actorId: userId,
			metadata: {
				projectId,
				count: uploaded.length,
				mimeTypes: uploaded.map((file) => file.mimeType),
			},
		})
		res.status(201).json(attachments)
	} catch (error) {
		await forgetProjectAssets(stored)
		await Promise.all(stored.map((url) => storage.remove(url)))
		respondWithError(res, error, "attach files to comment")
	}
}

export const listCommentRevisions = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { role } = authorizedScope(res)
		res
			.status(200)
			.json(await commentsService.listCommentRevisions(req.params.commentId, role))
	} catch (error) {
		respondWithError(res, error, "list comment revisions")
	}
}

export const updateComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId, projectId } = authorizedScope(res)
		const { revisionId, ...updated } = await commentsService.updateComment(
			req.params.commentId,
			{ content: req.body.content },
			userId
		)
		if (revisionId) {
			await recordAudit({
				action: "comment.edited",
				targetType: "comment",
				targetId: req.params.commentId,
				actorId: userId,
				metadata: { projectId, revisionId },
			})
		}
		res.status(200).json(updated)
	} catch (error) {
		respondWithError(res, error, "update comment")
	}
}

export const deleteComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId, projectId, role } = authorizedScope(res)
		const { moderated } = await commentsService.deleteComment(
			req.params.commentId,
			userId,
			role
		)
		await recordAudit({
			action: moderated ? "comment.deleted_by_owner" : "comment.deleted",
			targetType: "comment",
			targetId: req.params.commentId,
			actorId: userId,
			metadata: { projectId },
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "delete comment")
	}
}

export const toggleLike = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const result = await commentsService.toggleLike(
			req.params.commentId,
			userId
		)
		res.status(200).json(result)
	} catch (error) {
		respondWithError(res, error, "toggle comment like")
	}
}

export const toggleResolved = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId, projectId, role } = authorizedScope(res)
		const result = await commentsService.toggleResolved(
			req.params.commentId,
			userId,
			role
		)
		await recordAudit({
			action: result.moderated
				? "comment.resolved_by_owner"
				: "comment.resolution_changed",
			targetType: "comment",
			targetId: req.params.commentId,
			actorId: userId,
			metadata: { projectId, resolved: result.resolved },
		})
		res.status(200).json({ resolved: result.resolved })
	} catch (error) {
		respondWithError(res, error, "toggle comment resolution")
	}
}
