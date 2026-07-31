import { Request, Response } from "express"
import { CommentsService } from "./comments.service"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { respondWithError } from "../../lib/http"

export const listComments = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const comments = await CommentsService.getCommentsByImageVersionId(
			req.params.imageVersionId,
			userId
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
		const { userId } = authorizedScope(res)
		const {
			content,
			parentId,
			annotation,
			timestamp,
			timestampEnd,
			page,
			modelAnchor,
			mentionedUserIds,
		} = req.body

		const comment = await CommentsService.createComment({
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
		})
		res.status(201).json(comment)
	} catch (error) {
		respondWithError(res, error, "create comment")
	}
}

export const updateComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const updated = await CommentsService.updateComment(
			req.params.commentId,
			{ content: req.body.content },
			userId
		)
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
		const { userId } = authorizedScope(res)
		await CommentsService.deleteComment(req.params.commentId, userId)
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
		const result = await CommentsService.toggleLike(
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
		const { userId } = authorizedScope(res)
		const result = await CommentsService.toggleResolved(
			req.params.commentId,
			userId
		)
		res.status(200).json(result)
	} catch (error) {
		respondWithError(res, error, "toggle comment resolution")
	}
}
