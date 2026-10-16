import { describe, expect, it, vi, beforeEach } from "vitest"
import fs from "fs/promises"
import path from "path"

const emitMock = vi.fn()

vi.mock("../../storage", async () => {
	const os = await import("os")
	const path = await import("path")
	return {
		uploadsDir: path.join(os.tmpdir(), "sculpt-rendition-recovery-test"),
		storage: { store: vi.fn(), remove: vi.fn() },
	}
})

vi.mock("../../lib/prisma", () => ({
	prisma: {
		imageVersion: {
			findMany: vi.fn(),
			updateMany: vi.fn(),
			count: vi.fn(),
			update: vi.fn(),
		},
	},
}))

vi.mock("../../realtime/socket", () => ({
	io: { to: vi.fn(() => ({ emit: emitMock })) },
}))

vi.mock("./video-pipeline", () => ({ enqueueVideoProxy: vi.fn() }))
vi.mock("./image-pipeline", () => ({ enqueueImageRendition: vi.fn() }))

import { prisma } from "../../lib/prisma"
import { uploadsDir } from "../../storage"
import { enqueueVideoProxy } from "./video-pipeline"
import { enqueueImageRendition } from "./image-pipeline"
import {
	INSTANCE_ID,
	durableSourcePath,
	processingDir,
	processingRoot,
	versionIdOfSource,
} from "./rendition-queue"
import {
	STALE_RENDITION_MS,
	failStaleRenditionJobs,
	removeAbandonedInstanceDirs,
	resumeOwnRenditionJobs,
} from "./rendition-recovery"

const mockedPrisma = vi.mocked(prisma, true)

const exists = (target: string): Promise<boolean> =>
	fs.access(target).then(
		() => true,
		() => false
	)

beforeEach(async () => {
	vi.clearAllMocks()
	await fs.rm(processingRoot, { recursive: true, force: true })
	await fs.mkdir(processingDir, { recursive: true })
	mockedPrisma.imageVersion.updateMany.mockResolvedValue({ count: 0 } as never)
	mockedPrisma.imageVersion.findMany.mockResolvedValue([] as never)
})

describe("instance identity", () => {
	it("persists a generated instance id so restarts keep owning their jobs", async () => {
		const stored = await fs.readFile(path.join(uploadsDir, ".instance-id"), "utf8")
		expect(stored.trim()).toBe(INSTANCE_ID)
	})

	it("recovers the version id from a durable source file name", () => {
		expect(versionIdOfSource("source-clx123.mov")).toBe("clx123")
		expect(versionIdOfSource("proxy-clx123.mp4")).toBeNull()
	})
})

describe("resumeOwnRenditionJobs", () => {
	it("re-queues jobs whose durable source survived the restart", async () => {
		const videoSource = durableSourcePath("v-video", ".mov")
		const imageSource = durableSourcePath("v-image", ".tiff")
		await fs.writeFile(videoSource, "raw")
		await fs.writeFile(imageSource, "raw")
		mockedPrisma.imageVersion.findMany.mockResolvedValueOnce([
			{ id: "v-video", mediaType: "VIDEO", thumbnailUrl: null },
			{ id: "v-image", mediaType: "IMAGE", thumbnailUrl: null },
		] as never)

		const result = await resumeOwnRenditionJobs()

		expect(result).toEqual({ resumed: 2, failed: 0 })
		expect(enqueueVideoProxy).toHaveBeenCalledWith({
			versionId: "v-video",
			sourcePath: videoSource,
			needsPoster: true,
		})
		expect(enqueueImageRendition).toHaveBeenCalledWith({
			versionId: "v-image",
			sourcePath: imageSource,
		})
	})

	it("fails jobs whose source is gone and tells viewers", async () => {
		mockedPrisma.imageVersion.findMany
			.mockResolvedValueOnce([
				{ id: "v-lost", mediaType: "VIDEO", thumbnailUrl: "uploads/t.jpg" },
			] as never)
			.mockResolvedValueOnce([
				{ id: "v-lost", imageId: "i1", proxyStatus: "FAILED" },
			] as never)

		const result = await resumeOwnRenditionJobs()

		expect(result).toEqual({ resumed: 0, failed: 1 })
		expect(mockedPrisma.imageVersion.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ["v-lost"] }, proxyStatus: "PENDING" },
			data: { proxyStatus: "FAILED" },
		})
		expect(emitMock).toHaveBeenCalledWith(
			"version-updated",
			expect.objectContaining({ id: "v-lost", proxyStatus: "FAILED" })
		)
		expect(enqueueVideoProxy).not.toHaveBeenCalled()
	})

	it("clears half-written outputs but keeps sources it will resume", async () => {
		const source = durableSourcePath("v1", ".mkv")
		const partialProxy = path.join(processingDir, "proxy-v1.mp4")
		await fs.writeFile(source, "raw")
		await fs.writeFile(partialProxy, "partial")
		mockedPrisma.imageVersion.findMany.mockResolvedValueOnce([
			{ id: "v1", mediaType: "VIDEO", thumbnailUrl: null },
		] as never)

		await resumeOwnRenditionJobs()

		expect(await exists(source)).toBe(true)
		expect(await exists(partialProxy)).toBe(false)
	})
})

describe("failStaleRenditionJobs", () => {
	it("only fails jobs that other instances stopped heartbeating", async () => {
		const now = Date.now()

		await failStaleRenditionJobs(now)

		const query = mockedPrisma.imageVersion.findMany.mock.calls[0][0] as {
			where: {
				proxyStatus: string
				updatedAt: { lt: Date }
				OR: unknown[]
			}
		}
		expect(query.where.proxyStatus).toBe("PENDING")
		expect(query.where.updatedAt.lt.getTime()).toBe(now - STALE_RENDITION_MS)
		expect(query.where.OR).toEqual([
			{ proxyOwner: null },
			{ proxyOwner: { not: INSTANCE_ID } },
		])
	})
})

describe("removeAbandonedInstanceDirs", () => {
	it("removes scratch space of instances that no longer own pending jobs", async () => {
		const abandoned = path.join(processingRoot, "old-instance")
		const busy = path.join(processingRoot, "busy-instance")
		await fs.mkdir(abandoned, { recursive: true })
		await fs.mkdir(busy, { recursive: true })
		mockedPrisma.imageVersion.count.mockImplementation((async (args: {
			where: { proxyOwner: string }
		}) => (args.where.proxyOwner === "busy-instance" ? 1 : 0)) as never)

		const removed = await removeAbandonedInstanceDirs(
			Date.now() + STALE_RENDITION_MS + 1000
		)

		expect(removed).toBe(1)
		expect(await exists(abandoned)).toBe(false)
		expect(await exists(busy)).toBe(true)
		expect(await exists(processingDir)).toBe(true)
	})

	it("leaves recently touched scratch space alone", async () => {
		const fresh = path.join(processingRoot, "fresh-instance")
		await fs.mkdir(fresh, { recursive: true })
		mockedPrisma.imageVersion.count.mockResolvedValue(0 as never)

		expect(await removeAbandonedInstanceDirs(Date.now())).toBe(0)
		expect(await exists(fresh)).toBe(true)
	})
})
