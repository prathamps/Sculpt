import fs from "fs/promises"
import path from "path"
import crypto from "crypto"
import { ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import {
	capturePosterFrame,
	probeDuration,
	probeFrameRate,
	transcodeToWebProxy,
} from "./ffmpeg"
import {
	RenditionJob,
	createRenditionQueue,
	emitVersionUpdated,
	processingDir,
} from "./rendition-queue"
import { recordProjectAssets } from "./media-access.service"

export interface VideoProxyJob extends RenditionJob {
	needsPoster: boolean
}

const DEFAULT_VIDEO_CONCURRENCY = 1

const videoConcurrency = (): number =>
	Math.max(1, Number(process.env.VIDEO_WORKER_CONCURRENCY) || DEFAULT_VIDEO_CONCURRENCY)

export const stageVideoForProcessing = async (
	stagedUploadPath: string
): Promise<string> => {
	await fs.mkdir(processingDir, { recursive: true })
	const workPath = path.join(
		processingDir,
		`source-${crypto.randomUUID()}${path.extname(stagedUploadPath)}`
	)
	await fs.copyFile(stagedUploadPath, workPath)
	return workPath
}

export const discardStagedVideo = async (workPath: string): Promise<void> => {
	await fs.unlink(workPath).catch(() => undefined)
}

const buildPoster = async (job: VideoProxyJob): Promise<string | null> => {
	const posterPath = path.join(processingDir, `poster-${job.versionId}.jpg`)
	try {
		await capturePosterFrame(job.sourcePath, posterPath)
		return await storage.store({
			path: posterPath,
			originalName: `poster-${job.versionId}.jpg`,
			mimeType: "image/jpeg",
		})
	} catch {
		await fs.unlink(posterPath).catch(() => undefined)
		return null
	}
}

const buildProxy = async (job: VideoProxyJob): Promise<void> => {
	await fs.mkdir(processingDir, { recursive: true })
	const proxyPath = path.join(processingDir, `proxy-${job.versionId}.mp4`)
	const [duration, frameRate] = await Promise.all([
		probeDuration(job.sourcePath),
		probeFrameRate(job.sourcePath),
	])
	await transcodeToWebProxy(job.sourcePath, proxyPath)

	const proxyUrl = await storage.store({
		path: proxyPath,
		originalName: `proxy-${job.versionId}.mp4`,
		mimeType: "video/mp4",
	})
	const thumbnailUrl = job.needsPoster ? await buildPoster(job) : null

	try {
		const version = await prisma.imageVersion.update({
			where: { id: job.versionId },
			data: {
				proxyUrl,
				proxyStatus: ProxyStatus.READY,
				...(duration !== null ? { duration } : {}),
				...(frameRate !== null ? { frameRate } : {}),
				...(thumbnailUrl ? { thumbnailUrl } : {}),
			},
			include: { image: { select: { projectId: true } } },
		})

		await recordProjectAssets(
			[proxyUrl, thumbnailUrl],
			version.image.projectId
		)
		emitVersionUpdated(version)
	} catch (error) {
		await storage.remove(proxyUrl)
		if (thumbnailUrl) await storage.remove(thumbnailUrl)
		throw error
	}
}

const queue = createRenditionQueue<VideoProxyJob>({
	name: "video-proxy",
	concurrency: videoConcurrency(),
	run: buildProxy,
})

export const enqueueVideoProxy = (job: VideoProxyJob): void => queue.enqueue(job)

export const videoQueueDepth = (): number => queue.depth()

export { failAbandonedProxyJobs } from "./rendition-queue"
