import path from "path"
import { Request, Response } from "express"
import { AuthenticatedUser } from "../../types"
import { storage, uploadsDir } from "../../storage"
import { isProjectMember } from "../projects/access"
import { projectIdForStoredPath, storedPathOf } from "./media-access.service"
import { respondWithError } from "../../lib/http"

const PRESIGNED_URL_TTL_SECONDS = 300

const setNonExecutableHeaders = (res: Response): void => {
	res.setHeader("X-Content-Type-Options", "nosniff")
	res.setHeader("Content-Disposition", "inline")
	res.setHeader("Content-Security-Policy", "default-src 'none'")
	res.setHeader("Cache-Control", "private, max-age=3600")
}

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

		const projectId = await projectIdForStoredPath(storedPath)
		if (!projectId) {
			res.status(404).json({ message: "Not found" })
			return
		}

		if (!(await isProjectMember(projectId, userId))) {
			res.status(403).json({ message: "You are not a member of this project" })
			return
		}

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
