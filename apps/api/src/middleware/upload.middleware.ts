import multer from "multer"
import path from "path"
import fs from "fs"
import { Request } from "express"

const uploadDir = path.join(__dirname, "../../uploads")

// Ensure the upload directory exists
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadDir)
	},
	filename: (_req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
		cb(
			null,
			file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
		)
	},
})

// Accept images and videos. Plan-based gating (video = PRO) happens in the
// controllers; here we only reject unrelated file types.
const fileFilter = (
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
	storage,
	fileFilter,
	limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
})

// Helper used by controllers to classify an uploaded file.
export const detectMediaType = (mimetype: string): "IMAGE" | "VIDEO" =>
	mimetype.startsWith("video/") ? "VIDEO" : "IMAGE"
