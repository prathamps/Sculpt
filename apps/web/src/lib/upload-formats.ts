import {
	MODEL_EXTENSIONS,
	MODEL_SOURCE_MIME_BY_EXTENSION,
	extensionOf,
	needsGlbConversion,
} from "./model-formats"

const IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/avif",
]

const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"]

const DOCUMENT_MIME_TYPES = ["application/pdf"]

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "avif"]
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"]
const DOCUMENT_EXTENSIONS = ["pdf"]

export const ACCEPTED_MIME_TYPES = [
	...IMAGE_MIME_TYPES,
	...VIDEO_MIME_TYPES,
	...DOCUMENT_MIME_TYPES,
	...Object.values(MODEL_SOURCE_MIME_BY_EXTENSION),
]

const ACCEPTED_EXTENSIONS = [
	...IMAGE_EXTENSIONS,
	...VIDEO_EXTENSIONS,
	...DOCUMENT_EXTENSIONS,
	...MODEL_EXTENSIONS,
]

export const FILE_INPUT_ACCEPT = [
	...ACCEPTED_MIME_TYPES,
	...ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`),
].join(",")

export const ACCEPTED_FORMAT_GROUPS = [
	{ label: "Images", formats: "JPG, PNG, WebP, GIF, AVIF" },
	{ label: "Video", formats: "MP4, WebM, MOV" },
	{ label: "Documents", formats: "PDF" },
	{ label: "3D", formats: "GLB, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ" },
]

export const isAcceptedUpload = (file: File): boolean =>
	ACCEPTED_MIME_TYPES.includes(file.type) ||
	ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))

const DEFAULT_MAX_UPLOAD_MB = 2048

export const MAX_UPLOAD_MB = Number(
	process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || DEFAULT_MAX_UPLOAD_MB
)

const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

export const isWithinUploadLimit = (file: File): boolean =>
	file.size <= MAX_UPLOAD_BYTES

export const MAX_BROWSER_CONVERTIBLE_MODEL_MB = 256

const MAX_BROWSER_CONVERTIBLE_MODEL_BYTES =
	MAX_BROWSER_CONVERTIBLE_MODEL_MB * 1024 * 1024

export const isTooLargeToConvertInBrowser = (file: File): boolean =>
	needsGlbConversion(file) &&
	file.size > MAX_BROWSER_CONVERTIBLE_MODEL_BYTES

export const unconvertibleModelMessage = (files: File[]): string => {
	if (files.length === 0) return ""
	return `${files.map((file) => file.name).join(", ")} ${
		files.length === 1 ? "is" : "are"
	} too large to convert in the browser (over ${MAX_BROWSER_CONVERTIBLE_MODEL_MB} MB). Export to GLB from your 3D tool and upload that instead.`
}

export const oversizedUploadMessage = (oversized: File[]): string => {
	if (oversized.length === 0) return ""
	const describe = (file: File) =>
		`${file.name} (${(file.size / 1024 / 1024).toFixed(0)} MB)`
	return `${oversized.map(describe).join(", ")} ${
		oversized.length === 1 ? "is" : "are"
	} larger than the ${MAX_UPLOAD_MB} MB upload limit. Ask an administrator to raise MAX_UPLOAD_MB, or upload a smaller file.`
}

export const rejectedUploadMessage = (rejected: File[]): string => {
	if (rejected.length === 0) return ""
	const names = rejected.map((file) => file.name).join(", ")
	return `${names} ${
		rejected.length === 1 ? "is not a supported format" : "are not supported formats"
	}. Sculpt accepts JPG, PNG, WebP, GIF and AVIF images, MP4, WebM and MOV video, PDF documents, and GLB, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF and WRL 3D models.`
}
