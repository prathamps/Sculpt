import multer from "multer"
import path from "path"
import fs from "fs"
import { Request } from "express"
import { uploadsDir } from "../storage"

const stagingDir = path.join(uploadsDir, ".staging")

fs.mkdirSync(stagingDir, { recursive: true })

// Only formats a browser renders inline are accepted. The stored extension is
// derived from the declared MIME type (never the client filename), so an upload
// can't be served as HTML/JS from the API origin. SVG is excluded deliberately —
// it can carry script and would be an XSS vector when served inline.
const MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/png": ".png",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/avif": ".avif",
	"video/mp4": ".mp4",
	"video/webm": ".webm",
	"video/quicktime": ".mov",
}

const isAllowedMime = (mimetype: string): boolean => mimetype in MIME_EXTENSIONS

const staging = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, stagingDir)
	},
	filename: (_req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
		cb(
			null,
			file.fieldname + "-" + uniqueSuffix + MIME_EXTENSIONS[file.mimetype]
		)
	},
})

const imagesAndVideosOnly = (
	_req: Request,
	file: Express.Multer.File,
	cb: multer.FileFilterCallback
) => {
	if (isAllowedMime(file.mimetype)) {
		cb(null, true)
	} else {
		cb(
			new Error(
				"Unsupported file type. Allowed: JPEG, PNG, GIF, WebP, AVIF images and MP4, WebM, MOV videos."
			)
		)
	}
}

const MAX_FILE_SIZE_MB = Number(process.env.MAX_UPLOAD_MB || 200)

export const upload = multer({
	storage: staging,
	fileFilter: imagesAndVideosOnly,
	limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
})

export const detectMediaType = (mimetype: string): "IMAGE" | "VIDEO" =>
	mimetype.startsWith("video/") ? "VIDEO" : "IMAGE"
