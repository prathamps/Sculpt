import { Request, Response } from "express"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { respondWithError } from "../../lib/http"
import { recordAudit, requestIp } from "../audit/audit.service"
import {
	clearRevisionCheck,
	getRevisionChecklist,
	recordRevisionCheck,
} from "./revision-check.service"

export const listRevisionChecklist = async (req: Request, res: Response): Promise<void> => {
	try {
		const { role } = authorizedScope(res)
		res.status(200).json(await getRevisionChecklist(req.params.versionId, role))
	} catch (error) {
		respondWithError(res, error, "list revision checklist")
	}
}

export const checkRevisionItem = async (req: Request, res: Response): Promise<void> => {
	try {
		const { userId, role } = authorizedScope(res)
		const { versionId, commentId } = req.params
		const result = await recordRevisionCheck({
			versionId,
			commentId,
			userId,
			role,
			status: req.body.status,
		})
		await recordAudit({
			action: "comment.revision_checked",
			targetType: "comment",
			targetId: commentId,
			actorId: userId,
			metadata: {
				imageVersionId: versionId,
				status: result.status,
				resolved: result.resolved,
				previousStatus: result.previous?.status ?? null,
				previousCheckedBy: result.previous?.checkedBy ?? null,
			},
			ipAddress: requestIp(req),
		})
		res.status(200).json(result)
	} catch (error) {
		respondWithError(res, error, "check revision item")
	}
}

export const uncheckRevisionItem = async (req: Request, res: Response): Promise<void> => {
	try {
		const { userId, role } = authorizedScope(res)
		const { versionId, commentId } = req.params
		const result = await clearRevisionCheck({ versionId, commentId, userId, role })
		await recordAudit({
			action: "comment.revision_check_cleared",
			targetType: "comment",
			targetId: commentId,
			actorId: userId,
			metadata: { imageVersionId: versionId, cleared: result.cleared },
			ipAddress: requestIp(req),
		})
		res.status(204).end()
	} catch (error) {
		respondWithError(res, error, "clear revision check")
	}
}
