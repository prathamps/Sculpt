import { describe, expect, it } from "vitest"
import { detectMediaType, isAllowedMime } from "./upload.middleware"

describe("detectMediaType", () => {
	it("maps mime types to media types", () => {
		expect(detectMediaType("application/pdf")).toBe("PDF")
		expect(detectMediaType("video/webm")).toBe("VIDEO")
		expect(detectMediaType("video/mp4")).toBe("VIDEO")
		expect(detectMediaType("image/png")).toBe("IMAGE")
		expect(detectMediaType("model/gltf-binary")).toBe("MODEL")
	})
})

describe("isAllowedMime", () => {
	it("accepts the supported inline-safe formats", () => {
		expect(isAllowedMime("application/pdf")).toBe(true)
		expect(isAllowedMime("image/webp")).toBe(true)
		expect(isAllowedMime("video/quicktime")).toBe(true)
		expect(isAllowedMime("model/gltf-binary")).toBe(true)
	})

	it("rejects scriptable or unknown types", () => {
		expect(isAllowedMime("image/svg+xml")).toBe(false)
		expect(isAllowedMime("text/html")).toBe(false)
		expect(isAllowedMime("application/octet-stream")).toBe(false)
		expect(isAllowedMime("model/gltf+json")).toBe(false)
	})
})
