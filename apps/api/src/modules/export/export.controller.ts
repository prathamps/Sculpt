import { Request, Response } from "express"
import { AuthenticatedUser } from "../../types"
import {
	buildImageReport,
	buildImageReportCsv,
	getImageProjectId,
} from "./report.service"
import { getMemberRole } from "../projects/access"
import { canSeeInternalComments } from "../comments/comments.service"
import { recordAudit, requestIp } from "../audit/audit.service"

const auditExport = (req: Request, imageId: string, format: string) =>
	recordAudit({
		action: "report.exported",
		targetType: "image",
		targetId: imageId,
		actorId: (req.user as AuthenticatedUser)?.id,
		metadata: { format },
		ipAddress: requestIp(req),
	})

interface ExportScope {
	includeInternal: boolean
}

const authorizeExport = async (
	imageId: string,
	userId: string,
	res: Response
): Promise<ExportScope | null> => {
	const projectId = await getImageProjectId(imageId)
	if (!projectId) {
		res.status(404).json({ message: "Image not found" })
		return null
	}
	const role = await getMemberRole(projectId, userId)
	if (!role) {
		res.status(403).json({ message: "You are not a member of this project" })
		return null
	}
	return { includeInternal: canSeeInternalComments(role) }
}

const slug = (name: string) =>
	name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "report"

export const getImageReportJson = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageId } = req.params
		const userId = (req.user as AuthenticatedUser).id
		const scope = await authorizeExport(imageId, userId, res)
		if (!scope) return

		const report = await buildImageReport(imageId, scope.includeInternal)
		if (!report) {
			res.status(404).json({ message: "Image not found" })
			return
		}
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${slug(report.image.name)}-report.json"`
		)
		await auditExport(req, imageId, "json")
		res.status(200).json(report)
	} catch (error) {
		res.status(500).json({ message: "Error generating report", error })
	}
}

export const getImageReportCsv = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageId } = req.params
		const userId = (req.user as AuthenticatedUser).id
		const scope = await authorizeExport(imageId, userId, res)
		if (!scope) return

		const report = await buildImageReport(imageId, scope.includeInternal)
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
		await auditExport(req, imageId, "csv")
		res.status(200).send(csv)
	} catch (error) {
		res.status(500).json({ message: "Error generating report", error })
	}
}
