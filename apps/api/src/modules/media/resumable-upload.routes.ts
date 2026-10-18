import express, { Request, RequestHandler, Router } from "express"
import * as controller from "./resumable-upload.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { requireProjectRole } from "../../middleware/authorize.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import {
	uploadChunkRateLimit,
	writeRateLimit,
} from "../../middleware/rate-limit.middleware"
import { getImageProjectId } from "../projects/access"
import { startResumableUploadSchema } from "./media.schema"
import {
	MAX_CHUNKS_IN_FLIGHT_PER_USER,
	RESUMABLE_CHUNK_BYTES,
	projectIdOfUpload,
} from "./resumable-upload.service"
import { AuthenticatedUser } from "../../types"

const router = Router()

router.use(authenticateJWT)

const projectOfNewUpload = (req: Request) =>
	req.body.imageId ? getImageProjectId(req.body.imageId) : req.body.projectId

const projectOfUpload = (req: Request) => projectIdOfUpload(req.params.uploadId)

const asRawChunk = express.raw({ type: () => true, limit: RESUMABLE_CHUNK_BYTES })

const chunksInFlight = new Map<string, number>()

export const limitChunksInFlight: RequestHandler = (req, res, next) => {
	const userId = (req.user as AuthenticatedUser | undefined)?.id ?? ""
	const current = chunksInFlight.get(userId) ?? 0
	if (current >= MAX_CHUNKS_IN_FLIGHT_PER_USER) {
		res.status(429).json({ message: "Too many chunks in flight. Send them one after another." })
		return
	}
	chunksInFlight.set(userId, current + 1)
	let released = false
	const release = () => {
		if (released) return
		released = true
		const remaining = (chunksInFlight.get(userId) ?? 1) - 1
		if (remaining > 0) chunksInFlight.set(userId, remaining)
		else chunksInFlight.delete(userId)
	}
	res.on("finish", release)
	res.on("close", release)
	next()
}

router.post(
	"/",
	writeRateLimit(),
	validateBody(startResumableUploadSchema),
	requireProjectRole("EDITOR", projectOfNewUpload),
	controller.start
)
router.get("/:uploadId", requireProjectRole("EDITOR", projectOfUpload), controller.status)
router.patch(
	"/:uploadId",
	uploadChunkRateLimit(),
	requireProjectRole("EDITOR", projectOfUpload),
	limitChunksInFlight,
	asRawChunk,
	controller.append
)
router.delete(
	"/:uploadId",
	writeRateLimit(),
	requireProjectRole("EDITOR", projectOfUpload),
	controller.cancel
)

export default router
