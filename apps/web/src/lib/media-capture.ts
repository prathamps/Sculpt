import { loadPdfjs } from "./pdf"

const THUMBNAIL_MAX_WIDTH = 640
const CAPTURE_TIMEOUT_MS = 10000

// Read a video file's duration (seconds) client-side, or null if unavailable.
export function getVideoDuration(file: File): Promise<number | null> {
	return new Promise((resolve) => {
		const video = document.createElement("video")
		video.preload = "metadata"
		video.onloadedmetadata = () => {
			resolve(isFinite(video.duration) ? video.duration : null)
			URL.revokeObjectURL(video.src)
		}
		video.onerror = () => resolve(null)
		video.src = URL.createObjectURL(file)
	})
}

const canvasToJpeg = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
	new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8))

const drawScaled = (
	source: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number
): HTMLCanvasElement | null => {
	if (!sourceWidth || !sourceHeight) return null
	const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / sourceWidth)
	const canvas = document.createElement("canvas")
	canvas.width = Math.round(sourceWidth * scale)
	canvas.height = Math.round(sourceHeight * scale)
	const ctx = canvas.getContext("2d")
	if (!ctx) return null
	ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
	return canvas
}

// Captures a poster frame from a video file in the browser. Resolves null on
// any failure — thumbnails are always optional and must never block an upload.
export function captureVideoThumbnail(file: File): Promise<Blob | null> {
	return new Promise((resolve) => {
		const video = document.createElement("video")
		const objectUrl = URL.createObjectURL(file)
		let settled = false

		const finish = (blob: Blob | null) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			URL.revokeObjectURL(objectUrl)
			resolve(blob)
		}

		const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS)

		video.preload = "auto"
		video.muted = true
		video.playsInline = true
		video.onloadedmetadata = () => {
			const duration = isFinite(video.duration) ? video.duration : 0
			video.currentTime = Math.min(0.5, duration / 2)
		}
		video.onseeked = async () => {
			const canvas = drawScaled(video, video.videoWidth, video.videoHeight)
			finish(canvas ? await canvasToJpeg(canvas) : null)
		}
		video.onerror = () => finish(null)
		video.src = objectUrl
	})
}

// Renders page 1 of a PDF file to a thumbnail. Resolves null on any failure.
export async function capturePdfThumbnail(file: File): Promise<Blob | null> {
	try {
		const pdfjs = await loadPdfjs()
		const loadingTask = pdfjs.getDocument({
			data: await file.arrayBuffer(),
		})
		const document = await loadingTask.promise
		try {
			const page = await document.getPage(1)
			const baseViewport = page.getViewport({ scale: 1 })
			const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / baseViewport.width)
			const viewport = page.getViewport({ scale })
			const canvas = window.document.createElement("canvas")
			canvas.width = Math.round(viewport.width)
			canvas.height = Math.round(viewport.height)
			const ctx = canvas.getContext("2d")
			if (!ctx) return null
			await page.render({ canvasContext: ctx, canvas, viewport }).promise
			return await canvasToJpeg(canvas)
		} finally {
			await loadingTask.destroy()
		}
	} catch {
		return null
	}
}

export function captureThumbnail(file: File): Promise<Blob | null> {
	if (file.type.startsWith("video/")) return captureVideoThumbnail(file)
	if (file.type === "application/pdf") return capturePdfThumbnail(file)
	return Promise.resolve(null)
}

// Browsers report an empty MIME type for .glb files, but the API derives the
// stored extension from the declared type, so it is set explicitly here
// before upload.
export function prepareUploadFile(file: File): File {
	if (!file.name.toLowerCase().endsWith(".glb")) return file
	if (file.type === "model/gltf-binary") return file
	return new File([file], file.name, { type: "model/gltf-binary" })
}
