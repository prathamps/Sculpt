import { describe, expect, it, vi, beforeEach } from "vitest"

const sendMock = vi.fn()

vi.mock("@aws-sdk/client-s3", () => ({
	S3Client: class {
		send = sendMock
	},
	PutObjectCommand: class {
		kind = "put"
		constructor(public input: unknown) {}
	},
	DeleteObjectCommand: class {
		kind = "delete"
		constructor(public input: unknown) {}
	},
}))

vi.mock("fs", () => ({ createReadStream: vi.fn(() => "stream") }))
vi.mock("fs/promises", () => ({
	default: { unlink: vi.fn().mockResolvedValue(undefined) },
}))

import { S3Storage } from "./s3-storage"

describe("S3Storage", () => {
	beforeEach(() => {
		sendMock.mockReset()
		sendMock.mockResolvedValue({})
	})

	it("builds AWS-style public urls when no endpoint is configured", async () => {
		const storage = new S3Storage({ bucket: "media", region: "eu-west-1" })
		const url = await storage.store({
			path: "/tmp/image-1.png",
			originalName: "a.png",
			mimeType: "image/png",
		})
		expect(url).toBe("https://media.s3.eu-west-1.amazonaws.com/image-1.png")
	})

	it("builds path-style urls for custom endpoints such as MinIO or R2", async () => {
		const storage = new S3Storage({
			bucket: "media",
			region: "auto",
			endpoint: "http://localhost:9000",
		})
		const url = await storage.store({
			path: "/tmp/image-2.png",
			originalName: "b.png",
			mimeType: "image/png",
		})
		expect(url).toBe("http://localhost:9000/media/image-2.png")
	})

	it("prefers an explicit public base url (e.g. a CDN)", async () => {
		const storage = new S3Storage({
			bucket: "media",
			region: "us-east-1",
			publicBaseUrl: "https://cdn.example.com/",
		})
		const url = await storage.store({
			path: "/tmp/image-3.png",
			originalName: "c.png",
			mimeType: "image/png",
		})
		expect(url).toBe("https://cdn.example.com/image-3.png")
	})

	it("deletes the object whose key matches the stored url", async () => {
		const storage = new S3Storage({ bucket: "media", region: "us-east-1" })
		await storage.remove(
			"https://media.s3.us-east-1.amazonaws.com/image-4.png"
		)
		expect(sendMock).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "delete",
				input: { Bucket: "media", Key: "image-4.png" },
			})
		)
	})

	it("never deletes urls that belong to a different origin", async () => {
		const storage = new S3Storage({ bucket: "media", region: "us-east-1" })
		await storage.remove("https://evil.example.com/image-4.png")
		expect(sendMock).not.toHaveBeenCalled()
	})
})
