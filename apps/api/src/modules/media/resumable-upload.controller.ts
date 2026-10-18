import { Request, Response } from "express"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { respondWithError } from "../../lib/http"
import { ValidationError } from "../../lib/errors"
import {
	OffsetMismatchError,
	RESUMABLE_CHUNK_BYTES,
	ResumableUpload,
	appendChunk,
	discardUpload,
	findUpload,
	startUpload,
} from "./resumable-upload.service"
import { StartResumableUploadBody } from "./media.schema"

const publicView = (session: ResumableUpload) => ({
	id: session.id,
	fileName: session.fileName,
	mimeType: session.mimeType,
	size: session.size,
	offset: session.received,
	chunkSize: RESUMABLE_CHUNK_BYTES,
})

const requestedOffset = (req: Request): number => {
	const raw = req.query.offset
	const offset = typeof raw === "string" && raw !== "" ? Number(raw) : NaN
	if (!Number.isSafeInteger(offset) || offset < 0) {
		throw new ValidationError("offset must be a whole number of bytes.")
	}
	return offset
}

const chunkOf = (req: Request): Buffer =>
	Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)

export const start = async (req: Request, res: Response): Promise<void> => {
	try {
		const { userId, projectId } = authorizedScope(res)
		const body = req.body as StartResumableUploadBody
		const session = await startUpload({
			userId,
			projectId,
			fileName: body.fileName,
			mimeType: body.mimeType,
			size: body.size,
		})
		res.status(201).json(publicView(session))
	} catch (error) {
		respondWithError(res, error, "start upload")
	}
}

export const status = async (req: Request, res: Response): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		res.status(200).json(publicView(await findUpload(req.params.uploadId, userId)))
	} catch (error) {
		respondWithError(res, error, "read upload")
	}
}

export const append = async (req: Request, res: Response): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const session = await appendChunk(
			req.params.uploadId,
			userId,
			requestedOffset(req),
			chunkOf(req)
		)
		res.status(200).json(publicView(session))
	} catch (error) {
		if (error instanceof OffsetMismatchError) {
			res.status(409).json({ message: error.message, offset: error.expectedOffset })
			return
		}
		respondWithError(res, error, "append upload chunk")
	}
}

export const cancel = async (req: Request, res: Response): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const session = await findUpload(req.params.uploadId, userId)
		await discardUpload(session.id)
		res.status(204).end()
	} catch (error) {
		respondWithError(res, error, "cancel upload")
	}
}
