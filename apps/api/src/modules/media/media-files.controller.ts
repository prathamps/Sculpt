import path from "path"
import { Request, Response } from "express"
import { AuthenticatedUser } from "../../types"
import { storage, uploadsDir } from "../../storage"
import { prisma } from "../../lib/prisma"
import { getMemberRole } from "../projects/access"
import {
	contentPolicyFor,
	mayDownloadOriginals,
} from "../projects/content-policy"
import { StoredAsset, assetForStoredPath, storedPathOf } from "./media-access.service"
import { recordAuditOnce } from "../audit/audit.service"
import { respondWithError } from "../../lib/http"

const PRESIGNED_URL_TTL_SECONDS = 300

const AUDITED_ASSET_KINDS = new Set(["ORIGINAL", "PROXY", "ATTACHMENT"])

const setNonExecutableHeaders = (res: Response): void => {
	res.setHeader("X-Content-Type-Options", "nosniff")
	res.setHeader("Content-Disposition", "inline")
	res.setHeader("Content-Security-Policy", "default-src 'none'")
	res.setHeader("Cache-Control", "private, max-age=3600")
}

const hasViewableProxy = async (imageVersionId: string | null): Promise<boolean> => {
	if (!imageVersionId) return false
	const version = await prisma.imageVersion.findUnique({
		where: { id: imageVersionId },
		select: { proxyUrl: true },
	})
	return !!version?.proxyUrl
}

const originalIsWithheld = async (
	asset: StoredAsset,
	mayDownload: boolean
): Promise<boolean> =>
	asset.kind === "ORIGINAL" && !mayDownload && (await hasViewableProxy(asset.imageVersionId))

const recordAccess = (userId: string, storedPath: string, asset: StoredAsset) =>
	AUDITED_ASSET_KINDS.has(asset.kind)
		? recordAuditOnce(`${userId}:${storedPath}`, {
				action: "media.accessed",
				targetType: asset.imageVersionId ? "imageVersion" : "mediaAsset",
				targetId: asset.imageVersionId ?? storedPath,
				actorId: userId,
				metadata: { projectId: asset.projectId, kind: asset.kind, storedPath },
			})
		: Promise.resolve()

export const serveMediaFile = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const storedPath = storedPathOf(req.params.filename ?? "")
		if (!storedPath) {
			res.status(404).json({ message: "Not found" })
			return
		}

		const userId = (req.user as AuthenticatedUser | undefined)?.id
		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		const asset = await assetForStoredPath(storedPath)
		if (!asset) {
			res.status(404).json({ message: "Not found" })
			return
		}

		const role = await getMemberRole(asset.projectId, userId)
		if (!role) {
			res.status(403).json({ message: "You are not a member of this project" })
			return
		}

		const policy = await contentPolicyFor(asset.projectId)
		if (await originalIsWithheld(asset, mayDownloadOriginals(policy, role))) {
			res.status(403).json({
				message: "Original files are not available to your role in this project.",
			})
			return
		}

		await recordAccess(userId, storedPath, asset)

		if (storage.temporaryReadUrl) {
			const signed = await storage.temporaryReadUrl(
				storedPath,
				PRESIGNED_URL_TTL_SECONDS
			)
			res.redirect(302, signed)
			return
		}

		setNonExecutableHeaders(res)
		res.sendFile(path.join(uploadsDir, storedPath), (error) => {
			if (error && !res.headersSent) {
				res.status(404).json({ message: "Not found" })
			}
		})
	} catch (error) {
		respondWithError(res, error, "serve media file")
	}
}
