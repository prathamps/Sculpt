import { describe, expect, it, vi } from "vitest"
import {
	ChunkResponse,
	RESUMABLE_THRESHOLD_BYTES,
	ResumableTransport,
	resumeKeyFor,
	retryDelayMs,
	shouldUploadResumably,
	uploadResumably,
} from "./resumable-upload"

const CHUNK = 4

const fileOf = (bytes: number, name = "cut.mp4") =>
	new File([new Uint8Array(bytes)], name, { type: "video/mp4", lastModified: 1 })

const fakeTransport = (overrides: Partial<ResumableTransport> = {}) => {
	const stored = new Map<string, string>()
	const sendChunk = vi.fn(
		async (path: string, chunk: Blob, onProgress: (loaded: number) => void): Promise<ChunkResponse> => {
			onProgress(chunk.size)
			const offset = Number(new URL(path, "http://sculpt.test").searchParams.get("offset"))
			return { status: 200, body: { offset: offset + chunk.size } }
		}
	)
	const transport: ResumableTransport = {
		request: vi.fn(async (method: string) =>
			method === "POST"
				? { status: 201, body: { id: "new-id", size: 10, offset: 0, chunkSize: CHUNK } }
				: { status: 404, body: null }
		),
		sendChunk,
		remember: vi.fn((key: string, id: string | null) => {
			if (id) stored.set(key, id)
			else stored.delete(key)
		}),
		recall: vi.fn((key: string) => stored.get(key) ?? null),
		sleep: vi.fn(async () => undefined),
		waitUntilOnline: vi.fn(async () => undefined),
		...overrides,
	}
	return { transport, stored, sendChunk }
}

const target = { projectId: "p1" }

describe("shouldUploadResumably", () => {
	it("switches to chunked uploads only when a file is large", () => {
		expect(shouldUploadResumably([fileOf(10)])).toBe(false)
		expect(
			shouldUploadResumably([fileOf(10), { size: RESUMABLE_THRESHOLD_BYTES } as File])
		).toBe(true)
	})
})

describe("uploadResumably", () => {
	it("sends the file in chunk-sized pieces at increasing offsets", async () => {
		const { transport, sendChunk } = fakeTransport()

		const id = await uploadResumably(fileOf(10), target, () => undefined, transport)

		expect(id).toBe("new-id")
		expect(sendChunk.mock.calls.map(([path, chunk]) => [path, chunk.size])).toEqual([
			["/api/uploads/new-id?offset=0", 4],
			["/api/uploads/new-id?offset=4", 4],
			["/api/uploads/new-id?offset=8", 2],
		])
	})

	it("reports every byte as it goes and finishes at the file size", async () => {
		const { transport } = fakeTransport()
		const progress: number[] = []

		await uploadResumably(fileOf(10), target, (sent) => progress.push(sent), transport)

		expect(progress.at(-1)).toBe(10)
		expect(progress).toEqual([...progress].sort((a, b) => a - b))
	})

	it("picks up where an interrupted upload of the same file left off", async () => {
		const file = fileOf(10)
		const { transport, stored, sendChunk } = fakeTransport({
			request: vi.fn(async (method: string) =>
				method === "GET"
					? { status: 200, body: { id: "old-id", size: 10, offset: 8, chunkSize: CHUNK } }
					: { status: 500, body: null }
			),
		})
		stored.set(resumeKeyFor(file, target), "old-id")

		await uploadResumably(file, target, () => undefined, transport)

		expect(sendChunk.mock.calls.map(([path]) => path)).toEqual([
			"/api/uploads/old-id?offset=8",
		])
	})

	it("starts over when the remembered upload has expired on the server", async () => {
		const file = fileOf(10)
		const { transport, stored } = fakeTransport()
		stored.set(resumeKeyFor(file, target), "expired-id")

		const id = await uploadResumably(file, target, () => undefined, transport)

		expect(id).toBe("new-id")
	})

	it("retries a dropped connection with growing waits instead of failing", async () => {
		const { transport, sendChunk } = fakeTransport()
		sendChunk
			.mockResolvedValueOnce({ status: 0, body: null })
			.mockResolvedValueOnce({ status: 503, body: null })

		await uploadResumably(fileOf(10), target, () => undefined, transport)

		expect(transport.sleep).toHaveBeenNthCalledWith(1, 1000)
		expect(transport.sleep).toHaveBeenNthCalledWith(2, 2000)
		expect(transport.waitUntilOnline).toHaveBeenCalledTimes(2)
	})

	it("jumps to the offset the server reports when a chunk was already stored", async () => {
		const { transport, sendChunk } = fakeTransport()
		sendChunk.mockResolvedValueOnce({ status: 409, body: { offset: 8 } })

		await uploadResumably(fileOf(10), target, () => undefined, transport)

		expect(sendChunk.mock.calls[1]?.[0]).toBe("/api/uploads/new-id?offset=8")
	})

	it("gives up with the server's reason on an error retrying cannot fix", async () => {
		const { transport, sendChunk } = fakeTransport()
		sendChunk.mockResolvedValueOnce({
			status: 400,
			body: { message: "does not match its declared type" },
		})

		await expect(
			uploadResumably(fileOf(10), target, () => undefined, transport)
		).rejects.toThrow("does not match its declared type")
	})

	it("stops after repeated failures rather than retrying forever", async () => {
		const { transport, sendChunk } = fakeTransport()
		sendChunk.mockResolvedValue({ status: 0, body: null })

		await expect(
			uploadResumably(fileOf(10), target, () => undefined, transport)
		).rejects.toThrow()
		expect(sendChunk).toHaveBeenCalledTimes(9)
	})
})

describe("retryDelayMs", () => {
	it("doubles and then levels off at thirty seconds", () => {
		expect([1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 30000])
	})
})
