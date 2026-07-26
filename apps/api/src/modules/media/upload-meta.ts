import { ValidationError } from "../../lib/errors"

export interface UploadFileMeta {
	duration: number | null
	hasThumbnail: boolean
	hasModelProxy: boolean
}

export interface CompanionFileCounts {
	thumbnails: number
	modelProxies: number
}

const sanitizeDuration = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null

export const parseFilesMeta = (
	rawFilesMeta: unknown,
	fileCount: number,
	companions: CompanionFileCounts,
	fallbackDuration: number | null
): UploadFileMeta[] => {
	if (rawFilesMeta === undefined || rawFilesMeta === null) {
		if (companions.thumbnails > 0 || companions.modelProxies > 0) {
			throw new ValidationError(
				"filesMeta is required when thumbnails or converted models are uploaded"
			)
		}
		return Array.from({ length: fileCount }, () => ({
			duration: fallbackDuration,
			hasThumbnail: false,
			hasModelProxy: false,
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
		(entry: {
			duration?: unknown
			hasThumbnail?: unknown
			hasModelProxy?: unknown
		}) => ({
			duration: sanitizeDuration(entry?.duration),
			hasThumbnail: entry?.hasThumbnail === true,
			hasModelProxy: entry?.hasModelProxy === true,
		})
	)

	if (metas.filter((m) => m.hasThumbnail).length !== companions.thumbnails) {
		throw new ValidationError(
			"Uploaded thumbnails do not match filesMeta entries"
		)
	}
	if (metas.filter((m) => m.hasModelProxy).length !== companions.modelProxies) {
		throw new ValidationError(
			"Uploaded converted models do not match filesMeta entries"
		)
	}

	return metas
}
