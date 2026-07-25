import {
	MODEL_EXTENSIONS,
	MODEL_SOURCE_MIME_BY_EXTENSION,
	extensionOf,
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

export const rejectedUploadMessage = (rejected: File[]): string => {
	if (rejected.length === 0) return ""
	const names = rejected.map((file) => file.name).join(", ")
	return `${names} ${
		rejected.length === 1 ? "is not a supported format" : "are not supported formats"
	}. Sculpt accepts JPG, PNG, WebP, GIF and AVIF images, MP4, WebM and MOV video, PDF documents, and GLB, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF and WRL 3D models.`
}
