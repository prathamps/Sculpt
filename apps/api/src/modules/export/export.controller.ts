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
import { respondWithError } from "../../lib/http"
import { ValidationError } from "../../lib/errors"
import { isTimecode } from "../../lib/timecode"
import { authorizedScope } from "../../middleware/authorize.middleware"
import {
	buildVersionMarkers,
	renderFcp7Xml,
	renderResolveEdl,
	timelineStartFrames,
} from "./markers.service"

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
		respondWithError(res, error, "generate report")
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
		respondWithError(res, error, "generate report")
	}
}

const MARKER_FORMATS = {
	edl: { contentType: "text/plain; charset=utf-8", render: renderResolveEdl },
	xml: { contentType: "application/xml; charset=utf-8", render: renderFcp7Xml },
} as const

type MarkerFormat = keyof typeof MARKER_FORMATS

const requestedTimelineStart = (req: Request): string | null => {
	const start = req.query.timelineStart
	return typeof start === "string" && start ? start : null
}

const exportMarkers =
	(format: MarkerFormat) =>
	async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId, role } = authorizedScope(res)
			const { versionId } = req.params
			const markers = await buildVersionMarkers(
				versionId,
				canSeeInternalComments(role)
			)
			if (!markers) {
				res.status(404).json({ message: "Version not found" })
				return
			}
			const requestedStart = requestedTimelineStart(req)
			if (requestedStart && !isTimecode(requestedStart)) {
				throw new ValidationError("timelineStart must look like HH:MM:SS:FF.")
			}
			const startFrames = timelineStartFrames(markers, requestedStart)
			if (startFrames === null) {
				throw new ValidationError("timelineStart is not valid at this frame rate.")
			}
			const { contentType, render } = MARKER_FORMATS[format]
			res.setHeader("Content-Type", contentType)
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${slug(markers.imageName)}-${slug(
					markers.versionName
				)}-markers.${format}"`
			)
			await recordAudit({
				action: "report.exported",
				targetType: "imageVersion",
				targetId: versionId,
				actorId: userId,
				metadata: { format: `markers.${format}`, markers: markers.markers.length },
				ipAddress: requestIp(req),
			})
			res.status(200).send(render(markers, startFrames))
		} catch (error) {
			respondWithError(res, error, "export markers")
		}
	}

export const getVersionMarkersEdl = exportMarkers("edl")

export const getVersionMarkersXml = exportMarkers("xml")
