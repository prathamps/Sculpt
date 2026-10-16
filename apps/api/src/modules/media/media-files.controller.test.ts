import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../storage", () => ({
	uploadsDir: "/uploads",
	storage: { store: vi.fn(), remove: vi.fn() },
}))
vi.mock("../../lib/prisma", () => ({
	prisma: { imageVersion: { findUnique: vi.fn() } },
}))
vi.mock("./media-access.service", () => ({
	storedPathOf: (url: string) => url.split("/").pop(),
	assetForStoredPath: vi.fn(),
}))
vi.mock("../projects/access", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../projects/access")>()
	return { ...actual, getMemberRole: vi.fn() }
})
vi.mock("../projects/content-policy", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../projects/content-policy")>()
	return { ...actual, contentPolicyFor: vi.fn() }
})
vi.mock("../audit/audit.service", () => ({ recordAuditOnce: vi.fn() }))

import { Request, Response } from "express"
import { prisma } from "../../lib/prisma"
import { assetForStoredPath } from "./media-access.service"
import { getMemberRole } from "../projects/access"
import { contentPolicyFor } from "../projects/content-policy"
import { recordAuditOnce } from "../audit/audit.service"
import { serveMediaFile } from "./media-files.controller"

const request = () =>
	({ params: { filename: "clip.mov" }, user: { id: "u1" } }) as unknown as Request

const response = () => {
	const res = {
		statusCode: 200,
		status: vi.fn((code: number) => {
			res.statusCode = code
			return res
		}),
		json: vi.fn(() => res),
		setHeader: vi.fn(),
		sendFile: vi.fn(),
		redirect: vi.fn(),
	}
	return res
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(getMemberRole).mockResolvedValue("VIEWER")
	vi.mocked(contentPolicyFor).mockResolvedValue({ allowDownloads: true, watermarkViewers: false })
})

describe("serveMediaFile", () => {
	it("records who opened an original file", async () => {
		vi.mocked(assetForStoredPath).mockResolvedValue({
			projectId: "p1",
			kind: "ORIGINAL",
			imageVersionId: "v1",
		})
		const res = response()

		await serveMediaFile(request(), res as unknown as Response)

		expect(res.sendFile).toHaveBeenCalled()
		expect(vi.mocked(recordAuditOnce)).toHaveBeenCalledWith(
			"u1:clip.mov",
			expect.objectContaining({
				action: "media.accessed",
				targetType: "imageVersion",
				targetId: "v1",
				actorId: "u1",
			})
		)
	})

	it("does not fill the trail with thumbnail loads", async () => {
		vi.mocked(assetForStoredPath).mockResolvedValue({
			projectId: "p1",
			kind: "THUMBNAIL",
			imageVersionId: "v1",
		})

		await serveMediaFile(request(), response() as unknown as Response)

		expect(vi.mocked(recordAuditOnce)).not.toHaveBeenCalled()
	})

	it("withholds the original from viewers when downloads are off and a playable copy exists", async () => {
		vi.mocked(contentPolicyFor).mockResolvedValue({ allowDownloads: false, watermarkViewers: false })
		vi.mocked(assetForStoredPath).mockResolvedValue({
			projectId: "p1",
			kind: "ORIGINAL",
			imageVersionId: "v1",
		})
		vi.mocked(prisma.imageVersion.findUnique).mockResolvedValue({ proxyUrl: "uploads/proxy.mp4" } as never)
		const res = response()

		await serveMediaFile(request(), res as unknown as Response)

		expect(res.statusCode).toBe(403)
		expect(res.sendFile).not.toHaveBeenCalled()
	})

	it("still serves the original when it is the only viewable copy", async () => {
		vi.mocked(contentPolicyFor).mockResolvedValue({ allowDownloads: false, watermarkViewers: false })
		vi.mocked(assetForStoredPath).mockResolvedValue({
			projectId: "p1",
			kind: "ORIGINAL",
			imageVersionId: "v1",
		})
		vi.mocked(prisma.imageVersion.findUnique).mockResolvedValue({ proxyUrl: null } as never)
		const res = response()

		await serveMediaFile(request(), res as unknown as Response)

		expect(res.sendFile).toHaveBeenCalled()
	})
})
