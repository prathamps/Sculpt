import multer from "multer"
import path from "path"
import fs from "fs"
import { Request } from "express"
import { uploadsDir } from "../storage"

const stagingDir = path.join(uploadsDir, ".staging")

fs.mkdirSync(stagingDir, { recursive: true })

const staging = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, stagingDir)
	},
	filename: (_req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
		cb(
			null,
			file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
		)
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
