import { describe, expect, it, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { LocalStorage } from "./local-storage"

describe("LocalStorage", () => {
	let workDir: string
	let uploadsDir: string
	let storage: LocalStorage

	beforeEach(async () => {
		workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sculpt-storage-"))
		uploadsDir = path.join(workDir, "uploads")
		storage = new LocalStorage(uploadsDir)
	})

	afterEach(async () => {
		await fs.rm(workDir, { recursive: true, force: true })
	})

	const stageFile = async (name: string, content: string) => {
		const staged = path.join(workDir, name)
		await fs.writeFile(staged, content)
		return staged
	}

	it("moves the staged file into the uploads dir and returns its relative url", async () => {
		const staged = await stageFile("image-123.png", "png-bytes")

		const url = await storage.store({
			path: staged,
			originalName: "hero.png",
			mimeType: "image/png",
		})

		expect(url).toBe("uploads/image-123.png")
		await expect(
			fs.readFile(path.join(uploadsDir, "image-123.png"), "utf8")
		).resolves.toBe("png-bytes")
		await expect(fs.access(staged)).rejects.toThrow()
	})

	it("removes a stored file by its url", async () => {
		const staged = await stageFile("image-456.png", "bytes")
		const url = await storage.store({
			path: staged,
			originalName: "a.png",
			mimeType: "image/png",
		})

		await storage.remove(url)

		await expect(
			fs.access(path.join(uploadsDir, "image-456.png"))
		).rejects.toThrow()
	})

	it("ignores removal of files that no longer exist", async () => {
		await expect(storage.remove("uploads/missing.png")).resolves.toBeUndefined()
	})
})
