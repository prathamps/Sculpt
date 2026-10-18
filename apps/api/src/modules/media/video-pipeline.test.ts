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

vi.mock("./ffmpeg", async (importOriginal) => ({
	...(await importOriginal<typeof import("./ffmpeg")>()),
	probeDuration: vi.fn(),
	probeVideoDetails: vi.fn(),
	transcodeToWebProxies: vi.fn(),
	capturePosterFrame: vi.fn(),
}))

import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import {
	capturePosterFrame,
	WebRendition,
	probeDuration,
	probeVideoDetails,
	transcodeToWebProxies,
} from "./ffmpeg"
import {
	enqueueVideoProxy,
	stageVideoForProcessing,
	videoQueueDepth,
} from "./video-pipeline"
import { INSTANCE_ID } from "./rendition-queue"

const mockedPrisma = vi.mocked(prisma, true)
const mockedStorage = vi.mocked(storage, true)
const mockedProbe = vi.mocked(probeDuration)
const mockedDetails = vi.mocked(probeVideoDetails)
const mockedTranscode = vi.mocked(transcodeToWebProxies)
const mockedPoster = vi.mocked(capturePosterFrame)

const writeOutput = async (_source: string, output: string): Promise<void> => {
	await fs.writeFile(output, "media-bytes")
}

const writeRenditions = async (
	_source: string,
	renditions: WebRendition[]
): Promise<void> => {
	await Promise.all(
		renditions.map((rendition) => fs.writeFile(rendition.outputPath, "media-bytes"))
	)
}

const SMALL_SOURCE = {
	frameRate: 24,
	frameRateExpression: "24/1",
	width: 640,
	height: 360,
	startTimecode: null,
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
	mockedDetails.mockResolvedValue(SMALL_SOURCE)
	mockedTranscode.mockImplementation(writeRenditions)
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

describe("renditions", () => {
	it("adds a lighter rendition and keeps the camera timecode for sources above 540p", async () => {
		mockedDetails.mockResolvedValue({
			frameRate: 23.976,
			frameRateExpression: "24000/1001",
			width: 3840,
			height: 2160,
			startTimecode: "01:00:00:00",
		})
		mockedStorage.store
			.mockResolvedValueOnce("uploads/proxy.mp4")
			.mockResolvedValueOnce("uploads/proxy-low.mp4")
		const sourcePath = await stageVideoForProcessing(await makeSourceFile())

		enqueueVideoProxy({ versionId: "v4k", sourcePath, needsPoster: false })

		await vi.waitFor(() =>
			expect(mockedPrisma.imageVersion.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: "v4k" },
					data: expect.objectContaining({
						proxyUrl: "uploads/proxy.mp4",
						proxyLowUrl: "uploads/proxy-low.mp4",
						frameRate: 23.976,
						startTimecode: "01:00:00:00",
					}),
				})
			)
		)
		const [, renditions, frameRateExpression] = mockedTranscode.mock.calls[0]
		expect(renditions.map((rendition) => rendition.maxHeight)).toEqual([1080, 540])
		expect(frameRateExpression).toBe("24000/1001")
	})

	it("transcodes a single rendition when the source is already small", async () => {
		mockedStorage.store.mockResolvedValueOnce("uploads/proxy.mp4")
		const sourcePath = await stageVideoForProcessing(await makeSourceFile())

		enqueueVideoProxy({ versionId: "vsd", sourcePath, needsPoster: false })

		await vi.waitFor(() =>
			expect(mockedPrisma.imageVersion.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: "vsd" },
					data: expect.objectContaining({ proxyLowUrl: null }),
				})
			)
		)
		expect(mockedTranscode.mock.calls[0][1]).toHaveLength(1)
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
