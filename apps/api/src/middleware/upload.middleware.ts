import multer from "multer"
import path from "path"
import fs from "fs"

const uploadDir = path.join(__dirname, "../../uploads")

// Ensure the upload directory exists
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadDir)
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
		cb(
			null,
			file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
		)
	},
})

export const upload = multer({ storage })
