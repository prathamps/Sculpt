import { describe, expect, it } from "vitest"
import { hasDeclaredMimeSignature, matchesDeclaredMime } from "./file-signature"
import {
	attachmentMimeTypes,
	uploadMimeTypes,
} from "./upload.middleware"

const header = (...parts: (string | number[])[]): Buffer =>
	Buffer.concat(
		parts.map((part) =>
			typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part)
		)
	)

const binaryStlOf = (triangles: number): Buffer => {
	const head = Buffer.alloc(84)
	head.write("exported by a slicer", 0, "latin1")
	head.writeUInt32LE(triangles, 80)
	return head
}

describe("matchesDeclaredMime", () => {
	it("accepts an mp4 that starts with an ISO media box", () => {
		expect(
			matchesDeclaredMime(header([0, 0, 0, 24], "ftypisom"), "video/mp4")
		).toBe(true)
	})

	it("rejects an HLS playlist declared as mp4", () => {
		expect(matchesDeclaredMime(header("#EXTM3U\n#EXT-X-"), "video/mp4")).toBe(
			false
		)
	})

	it("rejects an HLS playlist declared as targa", () => {
		expect(
			matchesDeclaredMime(header("#EXTM3U\n#EXT-X-"), "image/x-tga")
		).toBe(false)
	})

	it("rejects a concat script declared as matroska", () => {
		expect(
			matchesDeclaredMime(header("ffconcat version 1.0"), "video/x-matroska")
		).toBe(false)
	})

	it("accepts genuine signatures per format", () => {
		expect(
			matchesDeclaredMime(header([0x1a, 0x45, 0xdf, 0xa3]), "video/webm")
		).toBe(true)
		expect(
			matchesDeclaredMime(header([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")
		).toBe(true)
		expect(
			matchesDeclaredMime(
				header([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]),
				"image/png"
			)
		).toBe(true)
		expect(matchesDeclaredMime(header("%PDF-1.7"), "application/pdf")).toBe(
			true
		)
		expect(
			matchesDeclaredMime(header("RIFF", [0, 0, 0, 0], "WEBP"), "image/webp")
		).toBe(true)
		expect(
			matchesDeclaredMime(header("RIFF", [0, 0, 0, 0], "AVI "), "video/x-msvideo")
		).toBe(true)
		expect(matchesDeclaredMime(header("glTF"), "model/gltf-binary")).toBe(true)
	})

	it("rejects a PNG payload declared as jpeg", () => {
		expect(
			matchesDeclaredMime(
				header([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]),
				"image/jpeg"
			)
		).toBe(false)
	})

	it("accepts ascii and binary stl, and rejects a truncated binary stl", () => {
		expect(matchesDeclaredMime(header("solid cube"), "model/stl")).toBe(true)
		expect(matchesDeclaredMime(binaryStlOf(2), "model/stl", 184)).toBe(true)
		expect(matchesDeclaredMime(binaryStlOf(2), "model/stl", 200)).toBe(false)
	})

	it("accepts text-based model formats and rejects binary payloads in them", () => {
		expect(matchesDeclaredMime(header("v 0 0 0\nf 1 2 3\n"), "model/obj")).toBe(
			true
		)
		expect(matchesDeclaredMime(header("G1 X0 Y0\n"), "text/x.gcode")).toBe(true)
		expect(
			matchesDeclaredMime(header("1.0 2.0 3.0\n"), "model/xyz")
		).toBe(true)

		const elf = header([0x7f], "ELF", [2, 1, 1, 0, 0, 0, 0, 0])
		expect(matchesDeclaredMime(elf, "model/obj")).toBe(false)
		expect(matchesDeclaredMime(elf, "text/x.gcode")).toBe(false)
		expect(matchesDeclaredMime(elf, "model/xyz")).toBe(false)
	})

	it("accepts container and markup model formats by their real signature", () => {
		expect(
			matchesDeclaredMime(header("PK", [0x03, 0x04]), "model/3mf")
		).toBe(true)
		expect(
			matchesDeclaredMime(header("PK", [0x03, 0x04]), "model/vnd.usdz+zip")
		).toBe(true)
		expect(
			matchesDeclaredMime(header('<?xml version="1.0"?>'), "model/vnd.collada+xml")
		).toBe(true)
		expect(
			matchesDeclaredMime(header('  {"asset":{}}'), "model/gltf+json")
		).toBe(true)
		expect(matchesDeclaredMime(header("ply\nformat ascii"), "model/ply")).toBe(
			true
		)
		expect(matchesDeclaredMime(header("#VRML V2.0 utf8"), "model/vrml")).toBe(
			true
		)
		expect(matchesDeclaredMime(header("VOX "), "model/vox")).toBe(true)
		expect(matchesDeclaredMime(header([0x4d, 0x4d, 0x0a]), "image/x-3ds")).toBe(
			true
		)
	})

	it("rejects a zip payload declared as collada", () => {
		expect(
			matchesDeclaredMime(header("PK", [0x03, 0x04]), "model/vnd.collada+xml")
		).toBe(false)
	})

	it("rejects a mime type it has no signature for", () => {
		expect(matchesDeclaredMime(header("anything"), "application/zip")).toBe(
			false
		)
	})
})

describe("signature coverage", () => {
	it("knows a signature for every mime type uploads accept", () => {
		const uncovered = uploadMimeTypes().filter(
			(mimetype) => !hasDeclaredMimeSignature(mimetype)
		)
		expect(uncovered).toEqual([])
	})

	it("knows a signature for every mime type attachments accept", () => {
		const uncovered = attachmentMimeTypes().filter(
			(mimetype) => !hasDeclaredMimeSignature(mimetype)
		)
		expect(uncovered).toEqual([])
	})
})
