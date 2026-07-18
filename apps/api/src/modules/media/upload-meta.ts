import { ValidationError } from "../../lib/errors"

export interface UploadFileMeta {
	duration: number | null
	hasThumbnail: boolean
}

const sanitizeDuration = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null

export const parseFilesMeta = (
	rawFilesMeta: unknown,
	fileCount: number,
	thumbnailCount: number,
	fallbackDuration: number | null
): UploadFileMeta[] => {
	if (rawFilesMeta === undefined || rawFilesMeta === null) {
		if (thumbnailCount > 0) {
			throw new ValidationError(
				"filesMeta is required when thumbnails are uploaded"
			)
		}
		return Array.from({ length: fileCount }, () => ({
			duration: fallbackDuration,
			hasThumbnail: false,
		}))
	}

	if (typeof rawFilesMeta !== "string") {
		throw new ValidationError("filesMeta must be a JSON string")
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(rawFilesMeta)
	} catch {
		throw new ValidationError("filesMeta must be valid JSON")
	}

	if (!Array.isArray(parsed) || parsed.length !== fileCount) {
		throw new ValidationError(
			"filesMeta must be an array with one entry per uploaded file"
		)
	}

	const metas = parsed.map(
		(entry: { duration?: unknown; hasThumbnail?: unknown }) => ({
			duration: sanitizeDuration(entry?.duration),
			hasThumbnail: entry?.hasThumbnail === true,
		})
	)

	const expectedThumbnails = metas.filter((m) => m.hasThumbnail).length
	if (expectedThumbnails !== thumbnailCount) {
		throw new ValidationError(
			"Uploaded thumbnails do not match filesMeta entries"
		)
	}

	return metas
}
