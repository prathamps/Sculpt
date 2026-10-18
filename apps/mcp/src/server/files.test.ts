import { describe, expect, it } from "vitest"
import { mimeTypeFor, resolveFile } from "./files.js"
import { isPrivateAddress } from "../net/safe-download.js"

describe("resolveFile", () => {
	it("decodes base64 and infers the type from the file name", async () => {
		const file = await resolveFile({ fileName: "hero.PNG", contentBase64: Buffer.from("png").toString("base64") }, 1024)
		expect(file).toMatchObject({ mimeType: "image/png", fileName: "hero.PNG" })
		expect(file.bytes.toString()).toBe("png")
	})

	it("accepts data URLs", async () => {
		const file = await resolveFile({ fileName: "a.jpg", contentBase64: `data:image/jpeg;base64,${Buffer.from("x").toString("base64")}` }, 1024)
		expect(file.bytes.toString()).toBe("x")
	})

	it("needs exactly one source", async () => {
		await expect(resolveFile({ fileName: "a.png" }, 1024)).rejects.toThrow(/exactly one/)
		await expect(
			resolveFile({ fileName: "a.png", contentBase64: "eA==", sourceUrl: "https://example.com/a.png" }, 1024)
		).rejects.toThrow(/exactly one/)
	})

	it("enforces the upload limit", async () => {
		await expect(resolveFile({ fileName: "a.png", contentBase64: Buffer.alloc(2048).toString("base64") }, 1024)).rejects.toThrow(/limited/)
	})

	it("refuses to download from private addresses", async () => {
		await expect(resolveFile({ fileName: "a.png", sourceUrl: "https://169.254.169.254/latest" }, 1024)).rejects.toThrow(/not a public address/)
		await expect(resolveFile({ fileName: "a.png", sourceUrl: "http://example.com/a.png" }, 1024)).rejects.toThrow(/https/)
	})

	it("asks for a type it cannot infer", async () => {
		await expect(resolveFile({ fileName: "mystery", contentBase64: "eA==" }, 1024)).rejects.toThrow(/mimeType/)
	})
})

describe("download safety", () => {
	it("classifies private and public addresses", () => {
		expect(isPrivateAddress("10.0.0.1")).toBe(true)
		expect(isPrivateAddress("::ffff:7f00:1")).toBe(true)
		expect(isPrivateAddress("fd00::1")).toBe(true)
		expect(isPrivateAddress("93.184.216.34")).toBe(false)
	})

	it("knows the common review formats", () => {
		expect(mimeTypeFor("cut.mov")).toBe("video/quicktime")
		expect(mimeTypeFor("deck.pdf")).toBe("application/pdf")
		expect(mimeTypeFor("chair.glb")).toBe("model/gltf-binary")
	})
})
