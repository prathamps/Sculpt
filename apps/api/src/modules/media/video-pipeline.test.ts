import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import os from "os"
import path from "path"

const emitMock = vi.fn()

vi.mock("../../storage", async () => {
	const os = await import("os")
	const path = await import("path")
	return {
		uploadsDir: path.join(os.tmpdir(), "sculpt-video-pipeline-test"),
		storage: { store: vi.fn(), remove: vi.fn() },
	}
})

vi.mock("../../lib/prisma", () => ({
	prisma: {
		imageVersion: {
			update: vi.fn(),
			updateMany: vi.fn(),
		},
		mediaAsset: {
			createMany: vi.fn(),
			deleteMany: vi.fn(),
		},
	},
}))

vi.mock("../../realtime/socket", () => ({
	io: { to: vi.fn(() => ({ emit: emitMock })) },
}))

vi.mock("./ffmpeg", () => ({
	probeDuration: vi.fn(),
	probeFrameRate: vi.fn(),
	transcodeToWebProxy: vi.fn(),
	capturePosterFrame: vi.fn(),
}))

import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import {
	capturePosterFrame,
	probeDuration,
	probeFrameRate,
	transcodeToWebProxy,
} from "./ffmpeg"
import {
	enqueueVideoProxy,
	failAbandonedProxyJobs,
	stageVideoForProcessing,
	videoQueueDepth,
} from "./video-pipeline"
import { INSTANCE_ID } from "./rendition-queue"

const mockedPrisma = vi.mocked(prisma, true)
const mockedStorage = vi.mocked(storage, true)
const mockedProbe = vi.mocked(probeDuration)
const mockedFrameRate = vi.mocked(probeFrameRate)
const mockedTranscode = vi.mocked(transcodeToWebProxy)
const mockedPoster = vi.mocked(capturePosterFrame)

const writeOutput = async (_source: string, output: string): Promise<void> => {
	await fs.writeFile(output, "media-bytes")
}

const makeSourceFile = async (): Promise<string> => {
	const dir = path.join(os.tmpdir(), "sculpt-video-pipeline-test", ".staging")
	await fs.mkdir(dir, { recursive: true })
	const filePath = path.join(dir, `upload-${Date.now()}-${Math.random()}.mp4`)
	await fs.writeFile(filePath, "raw-video")
	return filePath
}

beforeEach(() => {
	vi.clearAllMocks()
	mockedProbe.mockResolvedValue(4.2)
	mockedFrameRate.mockResolvedValue(24)
	mockedTranscode.mockImplementation(writeOutput)
	mockedPoster.mockImplementation(writeOutput)
	mockedPrisma.imageVersion.update.mockResolvedValue({
		id: "v1",
		imageId: "img1",
		proxyUrl: "uploads/proxy.mp4",
		proxyStatus: "READY",
		duration: 4.2,
		thumbnailUrl: "uploads/poster.jpg",
		image: { projectId: "p1" },
	} as never)
})

afterEach(async () => {
	await vi.waitFor(() => expect(videoQueueDepth()).toBe(0))
})

describe("enqueueVideoProxy", () => {
	it("stores the proxy and poster, then marks the version READY with the probed duration", async () => {
		mockedStorage.store
			.mockResolvedValueOnce("uploads/proxy.mp4")
			.mockResolvedValueOnce("uploads/poster.jpg")
		const sourcePath = await stageVideoForProcessing(await makeSourceFile())

		enqueueVideoProxy({ versionId: "v1", sourcePath, needsPoster: true })

		await vi.waitFor(() =>
			expect(mockedPrisma.imageVersion.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: "v1" },
					data: expect.objectContaining({
						proxyUrl: "uploads/proxy.mp4",
						proxyStatus: "READY",
						duration: 4.2,
						thumbnailUrl: "uploads/poster.jpg",
					}),
				})
			)
		)
		expect(emitMock).toHaveBeenCalledWith(
			"version-updated",
			expect.objectContaining({ id: "v1", proxyStatus: "READY" })
		)
		await vi.waitFor(async () =>
			expect(await fs.access(sourcePath).then(() => true, () => false)).toBe(
				false
			)
		)
	})

	it("skips the poster when the client already provided a thumbnail", async () => {
		mockedStorage.store.mockResolvedValueOnce("uploads/proxy.mp4")
		const sourcePath = await stageVideoForProcessing(await makeSourceFile())

		enqueueVideoProxy({ versionId: "v2", sourcePath, needsPoster: false })

		await vi.waitFor(() =>
			expect(mockedPrisma.imageVersion.update).toHaveBeenCalled()
		)
		expect(mockedPoster).not.toHaveBeenCalled()
		expect(mockedPrisma.imageVersion.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.not.objectContaining({ thumbnailUrl: expect.anything() }),
			})
		)
	})

	it("marks the version FAILED when the transcode errors", async () => {
		mockedTranscode.mockRejectedValue(new Error("codec exploded"))
		const sourcePath = await stageVideoForProcessing(await makeSourceFile())

		enqueueVideoProxy({ versionId: "v3", sourcePath, needsPoster: true })

		await vi.waitFor(() =>
			expect(mockedPrisma.imageVersion.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: "v3" },
					data: { proxyStatus: "FAILED" },
				})
			)
		)
		expect(mockedStorage.store).not.toHaveBeenCalled()
	})

	it("removes the stored proxy when the version vanished mid-job", async () => {
		mockedStorage.store.mockResolvedValueOnce("uploads/orphan.mp4")
		mockedPrisma.imageVersion.update.mockRejectedValue(
			new Error("Record not found")
		)
		const sourcePath = await stageVideoForProcessing(await makeSourceFile())

		enqueueVideoProxy({ versionId: "gone", sourcePath, needsPoster: false })

		await vi.waitFor(() =>
			expect(mockedStorage.remove).toHaveBeenCalledWith("uploads/orphan.mp4")
		)
	})
})

describe("failAbandonedProxyJobs", () => {
	it("fails this instance's own abandoned jobs", async () => {
		mockedPrisma.imageVersion.updateMany.mockResolvedValue({
			count: 2,
		} as never)

		await failAbandonedProxyJobs()

		const call = mockedPrisma.imageVersion.updateMany.mock.calls[0][0] as {
			where: { proxyStatus: string; OR: { proxyOwner: string | null }[] }
			data: { proxyStatus: string }
		}
		expect(call.data).toEqual({ proxyStatus: "FAILED" })
		expect(call.where.proxyStatus).toBe("PENDING")
		expect(call.where.OR[0].proxyOwner).toBe(INSTANCE_ID)
	})

	it("never touches jobs owned by another running instance", async () => {
		mockedPrisma.imageVersion.updateMany.mockResolvedValue({
			count: 0,
		} as never)

		await failAbandonedProxyJobs()

		const call = mockedPrisma.imageVersion.updateMany.mock.calls[0][0] as {
			where: { OR: { proxyOwner: string | null }[] }
		}
		const ownerFilters = call.where.OR.map((clause) => clause.proxyOwner)
		expect(ownerFilters).toEqual([INSTANCE_ID, null])
	})
})

describe("job ownership", () => {
	it("claims a job for this instance before transcoding", async () => {
		mockedStorage.store.mockResolvedValueOnce("uploads/proxy.mp4")
		const sourcePath = await stageVideoForProcessing(await makeSourceFile())

		enqueueVideoProxy({ versionId: "v9", sourcePath, needsPoster: false })

		await vi.waitFor(() =>
			expect(mockedPrisma.imageVersion.update).toHaveBeenCalledWith({
				where: { id: "v9" },
				data: { proxyOwner: INSTANCE_ID },
			})
		)
	})
})
