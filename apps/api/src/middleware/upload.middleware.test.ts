import { describe, expect, it } from "vitest"
import {
	detectMediaType,
	isAllowedMime,
	needsBrowserSafeImageRendition,
} from "./upload.middleware"

describe("detectMediaType", () => {
	it("maps documents, models, video and images to their media type", () => {
		expect(detectMediaType("application/pdf")).toBe("PDF")
		expect(detectMediaType("model/gltf-binary")).toBe("MODEL")
		expect(detectMediaType("model/gltf+json")).toBe("MODEL")
		expect(detectMediaType("model/pcd")).toBe("MODEL")
		expect(detectMediaType("video/webm")).toBe("VIDEO")
		expect(detectMediaType("video/x-matroska")).toBe("VIDEO")
		expect(detectMediaType("application/mxf")).toBe("VIDEO")
		expect(detectMediaType("image/png")).toBe("IMAGE")
		expect(detectMediaType("image/vnd.adobe.photoshop")).toBe("IMAGE")
	})

	it("keeps 3DS as a model even though its mime type is an image type", () => {
		expect(detectMediaType("image/x-3ds")).toBe("MODEL")
	})
})

describe("isAllowedMime", () => {
	it("accepts images browsers render directly", () => {
		for (const mime of [
			"image/jpeg",
			"image/png",
			"image/webp",
			"image/avif",
			"image/gif",
			"image/bmp",
		]) {
			expect(isAllowedMime(mime)).toBe(true)
		}
	})

	it("accepts images that need a rendition before a browser can show them", () => {
		for (const mime of [
			"image/tiff",
			"image/vnd.adobe.photoshop",
			"image/x-targa",
			"image/x-exr",
			"image/x-dpx",
		]) {
			expect(isAllowedMime(mime)).toBe(true)
		}
	})

	it("accepts video containers a browser cannot play, since they are transcoded", () => {
		for (const mime of [
			"video/x-matroska",
			"video/x-msvideo",
			"video/x-ms-wmv",
			"video/mpeg",
			"video/mp2t",
			"application/mxf",
		]) {
			expect(isAllowedMime(mime)).toBe(true)
		}
	})

	it("accepts every 3D format the browser converts to GLB", () => {
		for (const mime of [
			"model/gltf-binary",
			"model/gltf+json",
			"model/fbx",
			"model/vnd.usdz+zip",
			"model/vnd.kmz",
			"model/vox",
			"model/pcd",
			"text/x.gcode",
		]) {
			expect(isAllowedMime(mime)).toBe(true)
		}
	})

	it("still rejects scriptable and unrecognised types", () => {
		expect(isAllowedMime("image/svg+xml")).toBe(false)
		expect(isAllowedMime("text/html")).toBe(false)
		expect(isAllowedMime("application/javascript")).toBe(false)
		expect(isAllowedMime("application/octet-stream")).toBe(false)
		expect(isAllowedMime("application/zip")).toBe(false)
	})
})

describe("needsBrowserSafeImageRendition", () => {
	it("is true only for images a browser cannot display", () => {
		expect(needsBrowserSafeImageRendition("image/tiff")).toBe(true)
		expect(needsBrowserSafeImageRendition("image/vnd.adobe.photoshop")).toBe(
			true
		)
		expect(needsBrowserSafeImageRendition("image/png")).toBe(false)
		expect(needsBrowserSafeImageRendition("image/bmp")).toBe(false)
		expect(needsBrowserSafeImageRendition("video/mp4")).toBe(false)
		expect(needsBrowserSafeImageRendition("model/gltf-binary")).toBe(false)
	})
})
