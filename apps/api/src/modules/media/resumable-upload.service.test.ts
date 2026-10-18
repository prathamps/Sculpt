import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs/promises"
import path from "path"

vi.mock("../../storage", async () => {
	const os = await import("os")
	const path = await import("path")
	return {
		uploadsDir: path.join(os.tmpdir(), `sculpt-resumable-test-${process.pid}`),
		storage: { store: vi.fn(), remove: vi.fn() },
	}
})

import {
	MAX_OPEN_UPLOADS_PER_USER,
	OffsetMismatchError,
	RESUMABLE_CHUNK_BYTES,
	TooManyUploadsError,
	UploadQuotaError,
	appendChunk,
	claimCompletedUpload,
	settleClaimedUpload,
	findUpload,
	projectIdOfUpload,
	reapIdleUploads,
	resumableDir,
	startUpload,
} from "./resumable-upload.service"

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const pngBytes = (length: number): Buffer =>
	Buffer.concat([PNG_HEADER, Buffer.alloc(Math.max(0, length - PNG_HEADER.length), 7)])

const start = (overrides: Partial<Parameters<typeof startUpload>[0]> = {}) =>
	startUpload({
		userId: "u1",
		projectId: "p1",
		fileName: "frame.png",
		mimeType: "image/png",
		size: 20,
		...overrides,
	})

beforeEach(async () => {
	await fs.rm(resumableDir, { recursive: true, force: true })
})

afterEach(async () => {
	await fs.rm(resumableDir, { recursive: true, force: true })
})

describe("startUpload", () => {
	it("opens a session at offset zero for a supported file", async () => {
		const session = await start()

		expect(session).toMatchObject({ received: 0, size: 20, projectId: "p1" })
		expect(session.id).toMatch(/^[a-f0-9]{32}$/)
		expect(await projectIdOfUpload(session.id)).toBe("p1")
	})

	it("refuses a file type Sculpt cannot review", async () => {
		await expect(start({ mimeType: "application/x-msdownload" })).rejects.toThrow(/Unsupported/)
	})

	it("refuses a file larger than the upload limit before any bytes arrive", async () => {
		await expect(start({ size: Number.MAX_SAFE_INTEGER })).rejects.toThrow(/upload limit/)
	})

	it("strips any directory a client smuggles into the file name", async () => {
		const session = await start({ fileName: "../../etc/passwd.png" })
		expect(session.fileName).toBe("passwd.png")
	})

	it("refuses new uploads once one person's unfinished uploads fill their quota", async () => {
		process.env.RESUMABLE_QUOTA_MB = "1"
		try {
			await start({ size: 700 * 1024 })
			await expect(start({ size: 400 * 1024 })).rejects.toBeInstanceOf(UploadQuotaError)
		} finally {
			delete process.env.RESUMABLE_QUOTA_MB
		}
	})

	it("cannot be raced past the open-upload cap", async () => {
		const attempts = await Promise.allSettled(
			Array.from({ length: MAX_OPEN_UPLOADS_PER_USER + 5 }, () => start())
		)
		expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(
			MAX_OPEN_UPLOADS_PER_USER
		)
	})

	it("caps how many unfinished uploads one person can hold open", async () => {
		for (let i = 0; i < MAX_OPEN_UPLOADS_PER_USER; i++) await start()

		await expect(start()).rejects.toBeInstanceOf(TooManyUploadsError)
		await expect(start({ userId: "u2" })).resolves.toBeTruthy()
	})
})

describe("appendChunk", () => {
	it("assembles chunks in order and reports progress", async () => {
		const session = await start()
		const bytes = pngBytes(20)

		expect((await appendChunk(session.id, "u1", 0, bytes.subarray(0, 12))).received).toBe(12)
		expect((await appendChunk(session.id, "u1", 12, bytes.subarray(12))).received).toBe(20)
	})

	it("tells a client that lost track where to resume", async () => {
		const session = await start()
		await appendChunk(session.id, "u1", 0, pngBytes(20).subarray(0, 10))

		const replay = appendChunk(session.id, "u1", 0, pngBytes(20).subarray(0, 10))

		await expect(replay).rejects.toBeInstanceOf(OffsetMismatchError)
		await expect(replay).rejects.toMatchObject({ expectedOffset: 10 })
	})

	it("keeps concurrent chunks for the same offset from both landing", async () => {
		const session = await start()
		const chunk = pngBytes(20).subarray(0, 10)

		const results = await Promise.allSettled([
			appendChunk(session.id, "u1", 0, chunk),
			appendChunk(session.id, "u1", 0, chunk),
		])

		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
		expect((await findUpload(session.id, "u1")).received).toBe(10)
	})

	it("refuses bytes beyond the declared size", async () => {
		const session = await start({ size: 10 })

		await expect(appendChunk(session.id, "u1", 0, pngBytes(11))).rejects.toThrow(/past the declared/)
	})

	it("refuses a chunk larger than the chunk size", async () => {
		const session = await start({ size: RESUMABLE_CHUNK_BYTES * 2 })

		await expect(
			appendChunk(session.id, "u1", 0, Buffer.alloc(RESUMABLE_CHUNK_BYTES + 1))
		).rejects.toThrow(/at most/)
	})

	it("discards a finished upload whose bytes do not match its declared type", async () => {
		const session = await start({ size: 8 })

		await expect(
			appendChunk(session.id, "u1", 0, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x6a, 0x75, 0x6e, 0x6b]))
		).rejects.toThrow(/does not match/)
		await expect(findUpload(session.id, "u1")).rejects.toThrow(/not found/)
	})

	it("hides another person's upload", async () => {
		const session = await start()

		await expect(appendChunk(session.id, "u2", 0, pngBytes(5))).rejects.toThrow(/not found/)
	})

	it("treats an id that is not an upload id as missing rather than as a path", async () => {
		await expect(findUpload("../../session", "u1")).rejects.toThrow(/not found/)
		expect(await projectIdOfUpload("../../session")).toBeNull()
	})
})

describe("claimCompletedUpload", () => {
	const finished = async () => {
		const session = await start()
		await appendChunk(session.id, "u1", 0, pngBytes(20))
		return session
	}

	it("stages the assembled file and closes the session once the media is created", async () => {
		const session = await finished()

		const claimed = await claimCompletedUpload(session.id, "u1", "p1", "images")

		expect(claimed).toMatchObject({ fileName: "frame.png", mimeType: "image/png", size: 20 })
		expect(path.basename(claimed.path)).toMatch(/^images-.*\.png$/)
		expect((await fs.readFile(claimed.path)).subarray(0, 8)).toEqual(PNG_HEADER)
		await settleClaimedUpload(session.id, "u1", true)
		await expect(findUpload(session.id, "u1")).rejects.toThrow(/not found/)
		await fs.unlink(claimed.path)
	})

	it("keeps a finished upload when adding it fails, so it can be added again", async () => {
		const session = await finished()
		const first = await claimCompletedUpload(session.id, "u1", "p1", "images")
		await fs.unlink(first.path)

		await settleClaimedUpload(session.id, "u1", false)
		const retry = await claimCompletedUpload(session.id, "u1", "p1", "images")

		expect((await fs.readFile(retry.path)).subarray(0, 8)).toEqual(PNG_HEADER)
		await fs.unlink(retry.path)
	})

	it("refuses to add the same upload twice at once", async () => {
		const session = await finished()
		const first = await claimCompletedUpload(session.id, "u1", "p1", "images")

		await expect(claimCompletedUpload(session.id, "u1", "p1", "images")).rejects.toThrow(
			/already being added/
		)
		await fs.unlink(first.path)
	})

	it("refuses to use an upload in a project it was not started for", async () => {
		const session = await finished()

		await expect(claimCompletedUpload(session.id, "u1", "p2", "images")).rejects.toThrow(
			/different project/
		)
	})

	it("refuses an upload that has not finished", async () => {
		const session = await start()
		await appendChunk(session.id, "u1", 0, pngBytes(20).subarray(0, 10))

		await expect(claimCompletedUpload(session.id, "u1", "p1", "images")).rejects.toThrow(
			/not finished/
		)
	})

	it("refuses another person's upload", async () => {
		const session = await finished()

		await expect(claimCompletedUpload(session.id, "u2", "p1", "images")).rejects.toThrow(
			/not found/
		)
	})
})

describe("reapIdleUploads", () => {
	it("removes sessions idle for a day and keeps recent ones", async () => {
		const stale = await start()
		const fresh = await start()
		const meta = path.join(resumableDir, stale.id, "session.json")
		const staleSession = JSON.parse(await fs.readFile(meta, "utf8"))
		staleSession.updatedAt = new Date(Date.now() - 25 * 3600000).toISOString()
		await fs.writeFile(meta, JSON.stringify(staleSession))

		expect(await reapIdleUploads()).toBe(1)
		await expect(findUpload(stale.id, "u1")).rejects.toThrow(/not found/)
		await expect(findUpload(fresh.id, "u1")).resolves.toBeTruthy()
	})
})
