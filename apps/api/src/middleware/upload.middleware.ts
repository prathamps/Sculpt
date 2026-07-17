import multer from "multer"
import path from "path"
import fs from "fs"
import { Request } from "express"
import { uploadsDir } from "../storage"

const stagingDir = path.join(uploadsDir, ".staging")

fs.mkdirSync(stagingDir, { recursive: true })

const MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/png": ".png",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".png",
	"video/mp4": ".mp4",
	"video/webm": ".webm",
	"video/quicktime": ".mov",
}

// Derive the stored extension from the declared MIME type, never the original
// filename, so an uploaded file can't be served as HTML/JS from the API origin
// regardless of what the client named it (image/svg is normalised away too).
const safeExtension = (file: Express.Multer.File): string =>
	MIME_EXTENSIONS[file.mimetype] ??
	(file.mimetype.startsWith("video/") ? ".mp4" : ".img")

const staging = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, stagingDir)
	},
	filename: (_req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
		cb(null, file.fieldname + "-" + uniqueSuffix + safeExtension(file))
	},
})

const imagesAndVideosOnly = (
	_req: Request,
	file: Express.Multer.File,
	cb: multer.FileFilterCallback
) => {
	if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
		cb(null, true)
	} else {
		cb(new Error("Only image and video files are allowed"))
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
