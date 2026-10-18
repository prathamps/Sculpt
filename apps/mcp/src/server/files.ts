import { downloadPublicFile, UnsafeDownloadError } from "../net/safe-download.js"
import { ToolInputError } from "./tool-kit.js"

const MIME_BY_EXTENSION: Record<string, string> = {
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
	psd: "image/vnd.adobe.photoshop",
	tga: "image/x-tga",
	exr: "image/x-exr",
	dpx: "image/x-dpx",
	jp2: "image/jp2",
	mp4: "video/mp4",
	m4v: "video/x-m4v",
	mov: "video/quicktime",
	webm: "video/webm",
	mkv: "video/x-matroska",
	avi: "video/x-msvideo",
	mpg: "video/mpeg",
	mpeg: "video/mpeg",
	pdf: "application/pdf",
	glb: "model/gltf-binary",
	gltf: "model/gltf+json",
	txt: "text/plain",
	md: "text/markdown",
	csv: "text/csv",
	json: "application/json",
	zip: "application/zip",
}

export const UPLOADABLE_MODEL_TYPES = new Set(["model/gltf-binary", "model/gltf+json"])

export const mimeTypeFor = (fileName: string): string | null => {
	const extension = fileName.split(".").pop()?.toLowerCase() ?? ""
	return MIME_BY_EXTENSION[extension] ?? null
}

export interface FileInput {
	fileName: string
	mimeType?: string
	contentBase64?: string
	sourceUrl?: string
}

export interface ResolvedFile {
	fileName: string
	mimeType: string
	bytes: Buffer
}

const BASE64 = /^[A-Za-z0-9+/_-]*={0,2}$/

const decodeBase64 = (encoded: string): Buffer => {
	const compact = encoded.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "")
	if (!BASE64.test(compact)) throw new ToolInputError("contentBase64 is not valid base64.")
	return Buffer.from(compact, compact.includes("-") || compact.includes("_") ? "base64url" : "base64")
}

const allowsPrivateSources = (): boolean =>
	process.env.MCP_ALLOW_PRIVATE_SOURCE_URLS?.trim().toLowerCase() === "true"

export const resolveFile = async (input: FileInput, maxBytes: number): Promise<ResolvedFile> => {
	if (!!input.contentBase64 === !!input.sourceUrl) {
		throw new ToolInputError("Provide exactly one of contentBase64 or sourceUrl.")
	}
	let bytes: Buffer
	let downloadedType: string | null = null
	if (input.contentBase64) {
		bytes = decodeBase64(input.contentBase64)
	} else {
		try {
			const downloaded = await downloadPublicFile(input.sourceUrl ?? "", {
				maxBytes,
				allowPrivateNetwork: allowsPrivateSources(),
			})
			bytes = downloaded.bytes
			downloadedType = downloaded.mimeType
		} catch (error) {
			throw new ToolInputError(
				error instanceof UnsafeDownloadError
					? `Could not download sourceUrl: ${error.message}`
					: "Could not download sourceUrl."
			)
		}
	}
	if (bytes.length === 0) throw new ToolInputError("The file is empty.")
	if (bytes.length > maxBytes) {
		throw new ToolInputError(
			`The file is ${(bytes.length / 1048576).toFixed(1)} MB; files sent through an AI assistant are limited to ${(maxBytes / 1048576).toFixed(0)} MB. Upload larger files in Sculpt directly.`
		)
	}
	const mimeType =
		input.mimeType ||
		mimeTypeFor(input.fileName) ||
		(downloadedType && downloadedType !== "application/octet-stream" ? downloadedType : null)
	if (!mimeType) {
		throw new ToolInputError(`Could not tell what kind of file ${input.fileName} is. Pass mimeType.`)
	}
	return { fileName: input.fileName, mimeType, bytes }
}

export const asBlob = (file: ResolvedFile): Blob =>
	new Blob([new Uint8Array(file.bytes)], { type: file.mimeType })
