import { describe, expect, it, vi, beforeEach } from "vitest"
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
	},
}))

vi.mock("../../realtime/socket", () => ({
	io: { to: vi.fn(() => ({ emit: emitMock })) },
}))

vi.mock("./ffmpeg", () => ({
	probeDuration: vi.fn(),
	transcodeToWebProxy: vi.fn(),
	capturePosterFrame: vi.fn(),
}))

import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import {
	capturePosterFrame,
	probeDuration,
	transcodeToWebProxy,
} from "./ffmpeg"
import {
	enqueueVideoProxy,
	failAbandonedProxyJobs,
	stageVideoForProcessing,
} from "./video-pipeline"

const mockedPrisma = vi.mocked(prisma, true)
const mockedStorage = vi.mocked(storage, true)
const mockedProbe = vi.mocked(probeDuration)
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
	mockedTranscode.mockImplementation(writeOutput)
	mockedPoster.mockImplementation(writeOutput)
	mockedPrisma.imageVersion.update.mockResolvedValue({
		id: "v1",
		imageId: "img1",
		proxyUrl: "uploads/proxy.mp4",
		proxyStatus: "READY",
		duration: 4.2,
		thumbnailUrl: "uploads/poster.jpg",
	} as never)
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
		mockedTranscode.mockRejectedValueOnce(new Error("codec exploded"))
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
	it("fails every job left PENDING by a previous process", async () => {
		mockedPrisma.imageVersion.updateMany.mockResolvedValue({
			count: 2,
		} as never)

		await failAbandonedProxyJobs()

		expect(mockedPrisma.imageVersion.updateMany).toHaveBeenCalledWith({
			where: { proxyStatus: "PENDING" },
			data: { proxyStatus: "FAILED" },
		})
	})
})
