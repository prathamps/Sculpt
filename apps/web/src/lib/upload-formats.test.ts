import { describe, expect, it } from "vitest"
import {
	ACCEPTED_MIME_TYPES,
	isAcceptedUpload,
	rejectedUploadMessage,
} from "./upload-formats"

const fileNamed = (name: string, type: string) =>
	new File([new Uint8Array([1])], name, { type })

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

	it("rejects image types the API would refuse, rather than letting the upload 400", () => {
		for (const [name, type] of [
			["photo.heic", "image/heic"],
			["scan.tiff", "image/tiff"],
			["old.bmp", "image/bmp"],
			["logo.svg", "image/svg+xml"],
		]) {
			expect(isAcceptedUpload(fileNamed(name, type))).toBe(false)
		}
	})

	it("rejects video containers the API would refuse", () => {
		expect(isAcceptedUpload(fileNamed("clip.avi", "video/x-msvideo"))).toBe(
			false
		)
		expect(isAcceptedUpload(fileNamed("clip.mkv", "video/x-matroska"))).toBe(
			false
		)
	})

	it("rejects 3D formats that need a CAD kernel or proprietary SDK", () => {
		for (const name of ["part.step", "part.iges", "mat.sbsar", "scene.blend"]) {
			expect(isAcceptedUpload(fileNamed(name, ""))).toBe(false)
		}
	})

	it("never advertises a type the API does not map", () => {
		expect(ACCEPTED_MIME_TYPES).not.toContain("image/svg+xml")
		expect(ACCEPTED_MIME_TYPES).not.toContain("model/gltf+json")
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
