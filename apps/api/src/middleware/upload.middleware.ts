import multer from "multer"
import path from "path"
import fs from "fs"
import { Request } from "express"
import { uploadsDir } from "../storage"

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
