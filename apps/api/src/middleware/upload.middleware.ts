import multer from "multer"
import path from "path"
import fs from "fs"
import { Request } from "express"
import { uploadsDir } from "../storage"

const stagingDir = path.join(uploadsDir, ".staging")

fs.mkdirSync(stagingDir, { recursive: true })

const INLINE_SAFE_MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/png": ".png",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/avif": ".avif",
	"video/mp4": ".mp4",
	"video/webm": ".webm",
	"video/quicktime": ".mov",
	"application/pdf": ".pdf",
	"model/gltf-binary": ".glb",
}

export const isAllowedMime = (mimetype: string): boolean =>
	mimetype in INLINE_SAFE_MIME_EXTENSIONS

const extensionFromDeclaredMime = (mimetype: string): string =>
	INLINE_SAFE_MIME_EXTENSIONS[mimetype]

const staging = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, stagingDir)
	},
	filename: (_req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
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
				"Unsupported file type. Allowed: JPEG, PNG, GIF, WebP, AVIF images, MP4, WebM, MOV videos, PDF documents and GLB 3D models."
			)
		)
	}
}

const MAX_FILE_SIZE_MB = Number(process.env.MAX_UPLOAD_MB || 200)

export const upload = multer({
	storage: staging,
	fileFilter: allowedMediaOnly,
	limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
})

export const detectMediaType = (
	mimetype: string
): "IMAGE" | "VIDEO" | "PDF" | "MODEL" =>
	mimetype === "application/pdf"
		? "PDF"
		: mimetype === "model/gltf-binary"
			? "MODEL"
			: mimetype.startsWith("video/")
				? "VIDEO"
				: "IMAGE"
