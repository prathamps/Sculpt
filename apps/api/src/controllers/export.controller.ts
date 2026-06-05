import { Request, Response } from "express"
import { AuthenticatedUser } from "../types"
import {
	buildImageReport,
	buildImageReportCsv,
	getImageProjectId,
	isProjectMember,
} from "../services/report.service"
import { assertCanExportReports } from "../services/subscription.service"
import { PlanLimitError } from "../lib/plans"

const handlePlanLimit = (error: unknown, res: Response): boolean => {
	if (error instanceof PlanLimitError) {
		res.status(402).json({
			message: error.message,
			code: error.code,
			limit: error.limit,
		})
		return true
	}
	return false
}

// Shared guard: caller must be a project member and have export rights (PRO).
const authorizeExport = async (
	imageId: string,
	userId: string,
	res: Response
): Promise<boolean> => {
	const projectId = await getImageProjectId(imageId)
	if (!projectId) {
		res.status(404).json({ message: "Image not found" })
		return false
	}
	const member = await isProjectMember(projectId, userId)
	if (!member) {
		res.status(403).json({ message: "You are not a member of this project" })
		return false
	}
	await assertCanExportReports(userId) // throws PlanLimitError on FREE
	return true
}

const slug = (name: string) =>
	name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "report"

// GET /api/export/image/:imageId/report.json
export const getImageReportJson = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageId } = req.params
		const userId = (req.user as AuthenticatedUser).id
		if (!(await authorizeExport(imageId, userId, res))) return

		const report = await buildImageReport(imageId)
		if (!report) {
			res.status(404).json({ message: "Image not found" })
			return
		}
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${slug(report.image.name)}-report.json"`
		)
		res.status(200).json(report)
	} catch (error) {
		if (handlePlanLimit(error, res)) return
		res.status(500).json({ message: "Error generating report", error })
	}
}

// GET /api/export/image/:imageId/report.csv
export const getImageReportCsv = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageId } = req.params
		const userId = (req.user as AuthenticatedUser).id
		if (!(await authorizeExport(imageId, userId, res))) return

		const report = await buildImageReport(imageId)
		if (!report) {
			res.status(404).json({ message: "Image not found" })
			return
		}
		const csv = buildImageReportCsv(report)
		res.setHeader("Content-Type", "text/csv; charset=utf-8")
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${slug(report.image.name)}-report.csv"`
		)
		res.status(200).send(csv)
	} catch (error) {
		if (handlePlanLimit(error, res)) return
		res.status(500).json({ message: "Error generating report", error })
	}
}
