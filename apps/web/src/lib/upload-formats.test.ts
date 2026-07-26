import { describe, expect, it } from "vitest"
import {
	ACCEPTED_MIME_TYPES,
	MAX_BROWSER_CONVERTIBLE_MODEL_MB,
	MAX_UPLOAD_MB,
	isAcceptedUpload,
	isTooLargeToConvertInBrowser,
	isWithinUploadLimit,
	oversizedUploadMessage,
	rejectedUploadMessage,
	unconvertibleModelMessage,
} from "./upload-formats"

const fileNamed = (name: string, type: string) =>
	new File([new Uint8Array([1])], name, { type })

const fileOfMegabytes = (name: string, megabytes: number) => {
	const file = new File([new Uint8Array([1])], name, { type: "video/mp4" })
	Object.defineProperty(file, "size", {
		value: Math.round(megabytes * 1024 * 1024),
	})
	return file
}

describe("isAcceptedUpload", () => {
	it("accepts the formats the API stores", () => {
		expect(isAcceptedUpload(fileNamed("a.png", "image/png"))).toBe(true)
		expect(isAcceptedUpload(fileNamed("a.mp4", "video/mp4"))).toBe(true)
		expect(isAcceptedUpload(fileNamed("a.mov", "video/quicktime"))).toBe(true)
		expect(isAcceptedUpload(fileNamed("a.pdf", "application/pdf"))).toBe(true)
	})

	it("accepts 3D files the browser reports with no MIME type", () => {
		for (const name of ["cube.glb", "rig.fbx", "part.stl", "scene.dae"]) {
			expect(isAcceptedUpload(fileNamed(name, ""))).toBe(true)
		}
	})

	it("accepts images that only work after a server-side rendition", () => {
		for (const [name, type] of [
			["scan.tiff", "image/tiff"],
			["layers.psd", "image/vnd.adobe.photoshop"],
			["sprite.tga", "image/x-targa"],
			["plate.exr", "image/x-exr"],
			["frame.dpx", "image/x-dpx"],
		]) {
			expect(isAcceptedUpload(fileNamed(name, type))).toBe(true)
		}
	})

	it("accepts video containers a browser cannot play, since they are transcoded", () => {
		for (const [name, type] of [
			["clip.mkv", "video/x-matroska"],
			["clip.avi", "video/x-msvideo"],
			["clip.wmv", "video/x-ms-wmv"],
			["broadcast.mxf", "application/mxf"],
			["stream.ts", "video/mp2t"],
		]) {
			expect(isAcceptedUpload(fileNamed(name, type))).toBe(true)
		}
	})

	it("still rejects formats nothing in the stack can decode", () => {
		for (const [name, type] of [
			["photo.heic", "image/heic"],
			["photo.cr2", ""],
			["logo.svg", "image/svg+xml"],
			["deck.pptx", ""],
			["archive.zip", "application/zip"],
		]) {
			expect(isAcceptedUpload(fileNamed(name, type))).toBe(false)
		}
	})

	it("rejects 3D formats that need a CAD kernel or proprietary SDK", () => {
		for (const name of ["part.step", "part.iges", "mat.sbsar", "scene.blend"]) {
			expect(isAcceptedUpload(fileNamed(name, ""))).toBe(false)
		}
	})

	it("never advertises a type the API refuses to store", () => {
		expect(ACCEPTED_MIME_TYPES).not.toContain("image/svg+xml")
		expect(ACCEPTED_MIME_TYPES).not.toContain("image/heic")
		expect(ACCEPTED_MIME_TYPES).not.toContain("application/octet-stream")
	})
})

describe("isWithinUploadLimit", () => {
	it("accepts a file at the limit and rejects one past it", () => {
		expect(isWithinUploadLimit(fileOfMegabytes("ok.mp4", MAX_UPLOAD_MB))).toBe(
			true
		)
		expect(
			isWithinUploadLimit(fileOfMegabytes("big.mp4", MAX_UPLOAD_MB + 1))
		).toBe(false)
	})
})

describe("oversizedUploadMessage", () => {
	it("is empty when every file fits", () => {
		expect(oversizedUploadMessage([])).toBe("")
	})

	it("names the file, its size and the limit", () => {
		const message = oversizedUploadMessage([
			fileOfMegabytes("huge.mp4", MAX_UPLOAD_MB + 300),
		])
		expect(message).toContain("huge.mp4")
		expect(message).toContain(`${MAX_UPLOAD_MB + 300} MB`)
		expect(message).toContain(`${MAX_UPLOAD_MB} MB upload limit`)
		expect(message).toContain("MAX_UPLOAD_MB")
	})
})

describe("isTooLargeToConvertInBrowser", () => {
	const modelOfMegabytes = (name: string, megabytes: number) => {
		const file = new File([new Uint8Array([1])], name, { type: "" })
		Object.defineProperty(file, "size", {
			value: Math.round(megabytes * 1024 * 1024),
		})
		return file
	}

	it("flags a large model that would need browser conversion", () => {
		expect(
			isTooLargeToConvertInBrowser(
				modelOfMegabytes("huge.fbx", MAX_BROWSER_CONVERTIBLE_MODEL_MB + 1)
			)
		).toBe(true)
	})

	it("allows a large GLB, which needs no conversion", () => {
		expect(
			isTooLargeToConvertInBrowser(
				modelOfMegabytes("huge.glb", MAX_BROWSER_CONVERTIBLE_MODEL_MB + 500)
			)
		).toBe(false)
	})

	it("allows a model within the conversion budget", () => {
		expect(
			isTooLargeToConvertInBrowser(
				modelOfMegabytes("fine.fbx", MAX_BROWSER_CONVERTIBLE_MODEL_MB - 1)
			)
		).toBe(false)
	})

	it("tells the uploader to export GLB instead", () => {
		const message = unconvertibleModelMessage([
			modelOfMegabytes("huge.fbx", MAX_BROWSER_CONVERTIBLE_MODEL_MB + 1),
		])
		expect(message).toContain("huge.fbx")
		expect(message).toContain("Export to GLB")
	})
})

describe("rejectedUploadMessage", () => {
	it("is empty when nothing was rejected", () => {
		expect(rejectedUploadMessage([])).toBe("")
	})

	it("names the offending files", () => {
		const message = rejectedUploadMessage([
			fileNamed("photo.heic", "image/heic"),
			fileNamed("clip.avi", "video/x-msvideo"),
		])
		expect(message).toContain("photo.heic")
		expect(message).toContain("clip.avi")
		expect(message).toContain("are not supported formats")
	})
})
