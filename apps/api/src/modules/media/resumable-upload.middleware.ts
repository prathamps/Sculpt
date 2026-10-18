import path from "path"
import { Readable } from "stream"
import { RequestHandler } from "express"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { respondWithError } from "../../lib/http"
import { ValidationError } from "../../lib/errors"
import {
	ClaimedUpload,
	claimCompletedUpload,
	settleClaimedUpload,
} from "./resumable-upload.service"

const UPLOAD_ID_PATTERN = /^[a-f0-9]{32}$/

export const uploadIdsOf = (raw: unknown): string[] => {
	let values: unknown = raw
	if (typeof raw === "string") {
		const trimmed = raw.trim()
		if (!trimmed) return []
		try {
			values = trimmed.startsWith("[") ? JSON.parse(trimmed) : [trimmed]
		} catch {
			throw new ValidationError("uploadIds must be a JSON array of upload ids.")
		}
	}
	if (values === undefined || values === null) return []
	if (!Array.isArray(values) || !values.every((id) => typeof id === "string" && UPLOAD_ID_PATTERN.test(id))) {
		throw new ValidationError("uploadIds must be a JSON array of upload ids.")
	}
	if (new Set(values).size !== values.length) {
		throw new ValidationError("Each upload can only be used once.")
	}
	return values as string[]
}

const asStagedFile = (fieldName: string, claimed: ClaimedUpload): Express.Multer.File => ({
	fieldname: fieldName,
	originalname: claimed.fileName,
	encoding: "7bit",
	mimetype: claimed.mimeType,
	size: claimed.size,
	destination: path.dirname(claimed.path),
	filename: path.basename(claimed.path),
	path: claimed.path,
	buffer: Buffer.alloc(0),
	stream: Readable.from([]),
})

type StagedFields = Record<string, Express.Multer.File[]>

export const attachResumableUploads =
	(fieldName: string, maxCount: number): RequestHandler =>
	async (req, res, next) => {
		try {
			const ids = uploadIdsOf(req.body?.uploadIds)
			if (ids.length === 0) {
				next()
				return
			}
			const { userId, projectId } = authorizedScope(res)
			const fields: StagedFields = (req.files && !Array.isArray(req.files)
				? req.files
				: {}) as StagedFields
			const staged = fields[fieldName] ?? []
			fields[fieldName] = staged
			req.files = fields
			if (staged.length + ids.length > maxCount) {
				throw new ValidationError(`At most ${maxCount} files can be uploaded at once.`)
			}
			const claimed: string[] = []
			let settled = false
			const settle = (succeeded: boolean) => {
				if (settled) return
				settled = true
				claimed.forEach((id) => void settleClaimedUpload(id, userId, succeeded))
			}
			res.on("finish", () => settle(res.statusCode < 400))
			res.on("close", () => settle(false))
			for (const id of ids) {
				staged.push(asStagedFile(fieldName, await claimCompletedUpload(id, userId, projectId, fieldName)))
				claimed.push(id)
			}
			next()
		} catch (error) {
			respondWithError(res, error, "attach resumable uploads")
		}
	}
