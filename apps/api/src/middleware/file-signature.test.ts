import { describe, expect, it } from "vitest"
import { matchesDeclaredMime } from "./file-signature"

const header = (...parts: (string | number[])[]): Buffer =>
	Buffer.concat(
		parts.map((part) =>
			typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part)
		)
	)

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

	it("passes formats without a reliable signature through", () => {
		expect(matchesDeclaredMime(header("solid cube"), "model/stl")).toBe(true)
		expect(matchesDeclaredMime(header("v 0 0 0"), "model/obj")).toBe(true)
	})
})
