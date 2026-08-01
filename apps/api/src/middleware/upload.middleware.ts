import multer from "multer"
import path from "path"
import fs from "fs"
import { randomBytes } from "crypto"
import { Request, RequestHandler } from "express"
import { uploadsDir } from "../storage"
import { logger } from "../lib/logger"

const stagingDir = path.join(uploadsDir, ".staging")

fs.mkdirSync(stagingDir, { recursive: true })

const MODEL_MIME_EXTENSIONS: Record<string, string> = {
	"model/gltf-binary": ".glb",
	"model/gltf+json": ".gltf",
	"model/fbx": ".fbx",
	"model/obj": ".obj",
	"model/stl": ".stl",
	"model/ply": ".ply",
	"model/vnd.collada+xml": ".dae",
	"model/3mf": ".3mf",
	"image/x-3ds": ".3ds",
	"model/vnd.usdz+zip": ".usdz",
	"application/x-amf": ".amf",
	"model/vrml": ".wrl",
	"model/vnd.kmz": ".kmz",
	"model/vox": ".vox",
	"model/pcd": ".pcd",
	"model/xyz": ".xyz",
	"text/x.gcode": ".gcode",
}

const BROWSER_RENDERABLE_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/png": ".png",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/avif": ".avif",
	"image/bmp": ".bmp",
	"image/x-icon": ".ico",
}

const TRANSCODED_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
	"image/tiff": ".tiff",
	"image/x-targa": ".tga",
	"image/x-tga": ".tga",
	"image/vnd.adobe.photoshop": ".psd",
	"image/x-exr": ".exr",
	"image/x-dpx": ".dpx",
	"image/jp2": ".jp2",
	"image/x-pcx": ".pcx",
	"image/x-portable-pixmap": ".ppm",
}

const VIDEO_MIME_EXTENSIONS: Record<string, string> = {
	"video/mp4": ".mp4",
	"video/x-m4v": ".m4v",
	"video/webm": ".webm",
	"video/quicktime": ".mov",
	"video/x-matroska": ".mkv",
	"video/x-msvideo": ".avi",
	"video/x-ms-wmv": ".wmv",
	"video/x-ms-asf": ".asf",
	"video/x-flv": ".flv",
	"video/mpeg": ".mpg",
	"video/mp2t": ".ts",
	"video/mp2t-m2ts": ".m2ts",
	"video/3gpp": ".3gp",
	"video/3gpp2": ".3g2",
	"video/ogg": ".ogv",
	"application/mxf": ".mxf",
	"video/x-dv": ".dv",
	"video/dvd": ".vob",
}

const SUPPORTED_MIME_EXTENSIONS: Record<string, string> = {
	...BROWSER_RENDERABLE_IMAGE_MIME_EXTENSIONS,
	...TRANSCODED_IMAGE_MIME_EXTENSIONS,
	...VIDEO_MIME_EXTENSIONS,
	"application/pdf": ".pdf",
	...MODEL_MIME_EXTENSIONS,
}

export const isAllowedMime = (mimetype: string): boolean =>
	mimetype in SUPPORTED_MIME_EXTENSIONS

export const needsBrowserSafeImageRendition = (mimetype: string): boolean =>
	mimetype in TRANSCODED_IMAGE_MIME_EXTENSIONS

const extensionFromDeclaredMime = (mimetype: string): string =>
	SUPPORTED_MIME_EXTENSIONS[mimetype]

const staging = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, stagingDir)
	},
	filename: (_req, file, cb) => {
		const uniqueSuffix = `${Date.now()}-${randomBytes(16).toString("hex")}`
		cb(
			null,
			file.fieldname + "-" + uniqueSuffix + extensionFromDeclaredMime(file.mimetype)
		)
	},
})

const allowedMediaOnly = (
	_req: Request,
	file: Express.Multer.File,
	cb: multer.FileFilterCallback
) => {
	if (isAllowedMime(file.mimetype)) {
		cb(null, true)
	} else {
		cb(
			new Error(
				"Unsupported file type. Sculpt accepts common image formats (including TIFF, PSD, TGA, EXR and DPX), video in most containers (including MKV, AVI, WMV, MPEG, MXF and ProRes), PDF documents, and 3D models (GLB, glTF, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF, WRL, KMZ, VOX, PCD, XYZ, GCODE)."
			)
		)
	}
}

const DEFAULT_MAX_UPLOAD_MB = 2048

export const maxUploadMb = Number(
	process.env.MAX_UPLOAD_MB || DEFAULT_MAX_UPLOAD_MB
)

export const oversizedUploadMessage = (): string =>
	`File is larger than the ${maxUploadMb} MB upload limit. Ask an administrator to raise MAX_UPLOAD_MB, or upload a smaller file.`

export const upload = multer({
	storage: staging,
	fileFilter: allowedMediaOnly,
	limits: { fileSize: maxUploadMb * 1024 * 1024 },
})

const ATTACHMENT_MIME_EXTENSIONS: Record<string, string> = {
	...BROWSER_RENDERABLE_IMAGE_MIME_EXTENSIONS,
	"application/pdf": ".pdf",
}

export const MAX_ATTACHMENTS_PER_COMMENT = 3
const MAX_ATTACHMENT_MB = 25

export const isAllowedAttachmentMime = (mimetype: string): boolean =>
	mimetype in ATTACHMENT_MIME_EXTENSIONS

const referenceFilesOnly = (
	_req: Request,
	file: Express.Multer.File,
	cb: multer.FileFilterCallback
) => {
	if (isAllowedAttachmentMime(file.mimetype)) {
		cb(null, true)
	} else {
		cb(
			new Error(
				"Attachments must be an image (JPEG, PNG, GIF, WebP, AVIF, BMP or ICO) or a PDF."
			)
		)
	}
}

export const uploadAttachments = multer({
	storage: staging,
	fileFilter: referenceFilesOnly,
	limits: {
		fileSize: MAX_ATTACHMENT_MB * 1024 * 1024,
		files: MAX_ATTACHMENTS_PER_COMMENT,
	},
})

const stagedFilesOf = (req: Request): Express.Multer.File[] => {
	const files = req.files
	if (!files) return []
	if (Array.isArray(files)) return files
	return Object.values(files).flat()
}

export const discardStagedUploadsWhenRequestEnds: RequestHandler = (
	req,
	res,
	next
) => {
	let swept = false
	const sweep = () => {
		if (swept) return
		swept = true
		void Promise.all(
			stagedFilesOf(req).map((file) =>
				fs.promises.unlink(file.path).catch(() => undefined)
			)
		)
	}
	res.on("close", sweep)
	res.on("finish", sweep)
	next()
}

const STAGING_MAX_AGE_MS = 6 * 3600000
const STAGING_REAP_INTERVAL_MS = 3600000

export const reapAbandonedStagedUploads = async (): Promise<number> => {
	const entries = await fs.promises.readdir(stagingDir).catch(() => [])
	const cutoff = Date.now() - STAGING_MAX_AGE_MS
	let removed = 0

	for (const entry of entries) {
		const fullPath = path.join(stagingDir, entry)
		const stat = await fs.promises.stat(fullPath).catch(() => null)
		if (!stat?.isFile() || stat.mtimeMs > cutoff) continue
		await fs.promises.unlink(fullPath).catch(() => undefined)
		removed++
	}

	return removed
}

export const startStagingReaper = (): NodeJS.Timeout => {
	const reap = () =>
		reapAbandonedStagedUploads()
			.then((removed) => {
				if (removed > 0) {
					logger.warn("Reaped abandoned staged uploads", { removed })
				}
			})
			.catch((error) => logger.error("Staging reaper failed", error))

	void reap()

	const timer = setInterval(reap, STAGING_REAP_INTERVAL_MS)
	timer.unref()
	return timer
}

export const detectMediaType = (
	mimetype: string
): "IMAGE" | "VIDEO" | "PDF" | "MODEL" =>
	mimetype === "application/pdf"
		? "PDF"
		: mimetype in MODEL_MIME_EXTENSIONS
			? "MODEL"
			: mimetype in VIDEO_MIME_EXTENSIONS
				? "VIDEO"
				: "IMAGE"
