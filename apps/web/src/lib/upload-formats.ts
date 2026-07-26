import {
	MODEL_EXTENSIONS,
	MODEL_SOURCE_MIME_BY_EXTENSION,
	extensionOf,
	needsGlbConversion,
} from "./model-formats"

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	bmp: "image/bmp",
	ico: "image/x-icon",
	tif: "image/tiff",
	tiff: "image/tiff",
	tga: "image/x-targa",
	psd: "image/vnd.adobe.photoshop",
	exr: "image/x-exr",
	dpx: "image/x-dpx",
	jp2: "image/jp2",
	pcx: "image/x-pcx",
	ppm: "image/x-portable-pixmap",
}

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
	mp4: "video/mp4",
	m4v: "video/x-m4v",
	webm: "video/webm",
	mov: "video/quicktime",
	mkv: "video/x-matroska",
	avi: "video/x-msvideo",
	wmv: "video/x-ms-wmv",
	asf: "video/x-ms-asf",
	flv: "video/x-flv",
	mpg: "video/mpeg",
	mpeg: "video/mpeg",
	ts: "video/mp2t",
	m2ts: "video/mp2t-m2ts",
	"3gp": "video/3gpp",
	"3g2": "video/3gpp2",
	ogv: "video/ogg",
	mxf: "application/mxf",
	dv: "video/x-dv",
	vob: "video/dvd",
}

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
	pdf: "application/pdf",
}

const NATIVELY_PLAYABLE_VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "mov", "ogv"]

export const UPLOAD_MIME_BY_EXTENSION: Record<string, string> = {
	...IMAGE_MIME_BY_EXTENSION,
	...VIDEO_MIME_BY_EXTENSION,
	...DOCUMENT_MIME_BY_EXTENSION,
	...MODEL_SOURCE_MIME_BY_EXTENSION,
}

const IMAGE_MIME_TYPES = Object.values(IMAGE_MIME_BY_EXTENSION)
const VIDEO_MIME_TYPES = Object.values(VIDEO_MIME_BY_EXTENSION)
const DOCUMENT_MIME_TYPES = Object.values(DOCUMENT_MIME_BY_EXTENSION)

const IMAGE_EXTENSIONS = Object.keys(IMAGE_MIME_BY_EXTENSION)
const VIDEO_EXTENSIONS = Object.keys(VIDEO_MIME_BY_EXTENSION)
const DOCUMENT_EXTENSIONS = Object.keys(DOCUMENT_MIME_BY_EXTENSION)

export const isNativelyPlayableVideo = (url: string): boolean =>
	NATIVELY_PLAYABLE_VIDEO_EXTENSIONS.includes(extensionOf(url))

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
	{
		label: "Images",
		formats: "JPG, PNG, WebP, GIF, AVIF, BMP, TIFF, PSD, TGA, EXR, DPX",
	},
	{
		label: "Video",
		formats: "MP4, MOV, WebM, MKV, AVI, WMV, MPEG, TS, 3GP, MXF, DV",
	},
	{ label: "Documents", formats: "PDF" },
	{
		label: "3D",
		formats:
			"GLB, glTF, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, KMZ, VOX, PCD, XYZ",
	},
]

export const ACCEPTED_FORMAT_COUNT = ACCEPTED_EXTENSIONS.length

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
	}. ${ACCEPTED_FORMAT_GROUPS.map(
		(group) => `${group.label}: ${group.formats}`
	).join(". ")}.`
}
