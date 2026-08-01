import { Request, Response } from "express"
import * as reviewService from "./reviews.service"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { respondWithError } from "../../lib/http"
import { recordAudit, requestIp } from "../audit/audit.service"
import { NotificationService } from "../notifications/notification.service"
import { prisma } from "../../lib/prisma"
import { AuthenticatedUser } from "../../types"

const describeDecision = (decision: string): string =>
	decision === "APPROVED" ? "approved" : "requested changes on"

const notifyProject = async (
	imageVersionId: string,
	actor: AuthenticatedUser,
	decision: string
): Promise<void> => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: imageVersionId },
		select: {
			versionName: true,
			image: { select: { id: true, name: true, projectId: true } },
		},
	})
	if (!version) return

	await NotificationService.createProjectNotification({
		projectId: version.image.projectId,
		excludeUserIds: [actor.id],
		content: `${actor.name || actor.email} ${describeDecision(decision)} ${version.image.name} (${version.versionName})`,
		metadata: {
			imageId: version.image.id,
			imageVersionId,
			type: "review",
		},
	})
}

export const recordDecision = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const { versionId } = req.params
		const { decision, note } = req.body

		const result = await reviewService.recordDecision({
			imageVersionId: versionId,
			userId,
			decision,
			note,
		})

		await recordAudit({
			action: "review.decision_recorded",
			targetType: "image_version",
			targetId: versionId,
			actorId: userId,
			metadata: { decision },
			ipAddress: requestIp(req),
		})

		await notifyProject(versionId, req.user as AuthenticatedUser, decision)

		res.status(200).json(result)
	} catch (error) {
		respondWithError(res, error, "record review decision")
	}
}

export const withdrawDecision = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const result = await reviewService.withdrawDecision(
			req.params.versionId,
			userId
		)

		await recordAudit({
			action: "review.reopened",
			targetType: "image_version",
			targetId: req.params.versionId,
			actorId: userId,
			ipAddress: requestIp(req),
		})

		res.status(200).json(result)
	} catch (error) {
		respondWithError(res, error, "withdraw review decision")
	}
}

export const listDecisions = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const result = await reviewService.listDecisions(req.params.versionId)
		res.status(200).json(result)
	} catch (error) {
		respondWithError(res, error, "list review decisions")
	}
}

export const setDueDate = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { dueAt } = req.body
		await reviewService.setDueDate(
			req.params.versionId,
			dueAt ? new Date(dueAt) : null
		)
		res.status(200).json({ dueAt: dueAt ?? null })
	} catch (error) {
		respondWithError(res, error, "set review due date")
	}
}

export const projectSummary = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = authorizedScope(res)
		const counts = await reviewService.projectReviewSummary(projectId)
		res.status(200).json(counts)
	} catch (error) {
		respondWithError(res, error, "summarise project reviews")
	}
}
