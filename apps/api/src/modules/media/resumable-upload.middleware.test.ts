import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./resumable-upload.service", () => ({
	claimCompletedUpload: vi.fn(),
	settleClaimedUpload: vi.fn(async () => undefined),
}))

import { claimCompletedUpload, settleClaimedUpload } from "./resumable-upload.service"
import { attachResumableUploads, uploadIdsOf } from "./resumable-upload.middleware"

const mockedClaim = vi.mocked(claimCompletedUpload)
const ID_A = "a".repeat(32)
const ID_B = "b".repeat(32)

const response = () => {
	const res = {
		locals: { authorizedScope: { userId: "u1", projectId: "p1", role: "EDITOR" } },
		listeners: {} as Record<string, (() => void)[]>,
		on(event: string, listener: () => void) {
			;(res.listeners[event] ??= []).push(listener)
			return res
		},
		emit(event: string) {
			res.listeners[event]?.forEach((listener) => listener())
		},
		statusCode: 200,
		body: undefined as unknown,
		status(code: number) {
			res.statusCode = code
			return res
		},
		json(body: unknown) {
			res.body = body
			return res
		},
	}
	return res
}

const run = async (body: Record<string, unknown>, files?: Record<string, unknown[]>) => {
	const req = { body, files } as never as { files: Record<string, { path: string }[]> }
	const res = response()
	const next = vi.fn()
	await attachResumableUploads("images", 2)(req as never, res as never, next)
	return { req, res, next }
}

beforeEach(() => {
	vi.clearAllMocks()
	mockedClaim.mockImplementation(async (id) => ({
		fileName: `${id.slice(0, 1)}.mp4`,
		mimeType: "video/mp4",
		size: 10,
		path: `/staging/images-${id}.mp4`,
	}))
})

describe("uploadIdsOf", () => {
	it("reads the JSON array a multipart form carries", () => {
		expect(uploadIdsOf(JSON.stringify([ID_A, ID_B]))).toEqual([ID_A, ID_B])
		expect(uploadIdsOf(ID_A)).toEqual([ID_A])
		expect(uploadIdsOf(undefined)).toEqual([])
	})

	it("rejects anything that is not a list of upload ids", () => {
		expect(() => uploadIdsOf("[1,2]")).toThrow()
		expect(() => uploadIdsOf("../etc")).toThrow()
		expect(() => uploadIdsOf(JSON.stringify([ID_A, ID_A]))).toThrow(/once/)
	})
})

describe("attachResumableUploads", () => {
	it("passes through untouched when the form names no uploads", async () => {
		const { next } = await run({})
		expect(next).toHaveBeenCalled()
		expect(mockedClaim).not.toHaveBeenCalled()
	})

	it("adds finished uploads after any multipart files, in the order given", async () => {
		const { req, next } = await run(
			{ uploadIds: JSON.stringify([ID_A]) },
			{ images: [{ path: "/staging/multipart.png" }] }
		)

		expect(next).toHaveBeenCalled()
		expect(req.files.images.map((file) => file.path)).toEqual([
			"/staging/multipart.png",
			`/staging/images-${ID_A}.mp4`,
		])
		expect(mockedClaim).toHaveBeenCalledWith(ID_A, "u1", "p1", "images")
	})

	it("closes the upload only when the media request succeeds", async () => {
		const { res } = await run({ uploadIds: JSON.stringify([ID_A]) })
		res.statusCode = 201
		res.emit("finish")
		res.emit("close")

		expect(vi.mocked(settleClaimedUpload)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(settleClaimedUpload)).toHaveBeenCalledWith(ID_A, "u1", true)
	})

	it("keeps the upload for a retry when the media request fails", async () => {
		const { res } = await run({ uploadIds: JSON.stringify([ID_A]) })
		res.statusCode = 400
		res.emit("finish")

		expect(vi.mocked(settleClaimedUpload)).toHaveBeenCalledWith(ID_A, "u1", false)
	})

	it("claims only for the caller's authorized project", async () => {
		await run({ uploadIds: JSON.stringify([ID_A]) })
		expect(mockedClaim.mock.calls[0].slice(1, 3)).toEqual(["u1", "p1"])
	})

	it("refuses more files than the route accepts", async () => {
		const { res, next } = await run(
			{ uploadIds: JSON.stringify([ID_A, ID_B]) },
			{ images: [{ path: "/staging/multipart.png" }] }
		)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(400)
		expect(mockedClaim).not.toHaveBeenCalled()
	})

	it("keeps already-claimed files on the request so they are swept when a later claim fails", async () => {
		mockedClaim
			.mockResolvedValueOnce({ fileName: "a.mp4", mimeType: "video/mp4", size: 1, path: "/staging/a.mp4" })
			.mockRejectedValueOnce(Object.assign(new Error("nope"), { statusCode: 400 }))

		const { req, res, next } = await run({ uploadIds: JSON.stringify([ID_A, ID_B]) })

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(500)
		expect(req.files.images.map((file) => file.path)).toEqual(["/staging/a.mp4"])
	})
})
