import { describe, expect, it } from "vitest"
import { downloadFileName } from "./download-name"

describe("downloadFileName", () => {
	it("keeps the stored extension and appends the version number", () => {
		expect(downloadFileName("hero shot", 3, "abc123.png")).toBe(
			"hero shot-v3.png"
		)
	})

	it("does not duplicate an extension already in the image name", () => {
		expect(downloadFileName("clip.mp4", 1, "stored.mp4")).toBe("clip-v1.mp4")
	})

	it("strips characters that break Content-Disposition", () => {
		expect(downloadFileName('we"ird/na\\me:*?', 2, "f.pdf")).toBe(
			"we_ird_na_me-v2.pdf"
		)
	})

	it("falls back to a generic name when nothing safe remains", () => {
		expect(downloadFileName("///", 1, "stored.glb")).toBe("asset-v1.glb")
	})
})
