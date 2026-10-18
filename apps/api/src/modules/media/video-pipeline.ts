import fs from "fs/promises"
import path from "path"
import crypto from "crypto"
import { ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import {
	FULL_RENDITION,
	LOW_RENDITION,
	WebRendition,
	capturePosterFrame,
	exceedsRendition,
	probeDuration,
	probeVideoDetails,
	transcodeToWebProxies,
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

const storeRendition = (rendition: WebRendition) =>
	storage.store({
		path: rendition.outputPath,
		originalName: path.basename(rendition.outputPath),
		mimeType: "video/mp4",
	})

const discardLocalRenditions = (renditions: WebRendition[]) =>
	Promise.all(
		renditions.map((rendition) =>
			fs.unlink(rendition.outputPath).catch(() => undefined)
		)
	)

const buildProxy = async (job: VideoProxyJob): Promise<void> => {
	await fs.mkdir(processingDir, { recursive: true })
	const [duration, details] = await Promise.all([
		probeDuration(job.sourcePath),
		probeVideoDetails(job.sourcePath),
	])
	const full: WebRendition = {
		...FULL_RENDITION,
		outputPath: path.join(processingDir, `proxy-${job.versionId}.mp4`),
	}
	const low: WebRendition | null = exceedsRendition(details, LOW_RENDITION)
		? {
				...LOW_RENDITION,
				outputPath: path.join(processingDir, `proxy-low-${job.versionId}.mp4`),
			}
		: null
	const renditions = low ? [full, low] : [full]

	try {
		await transcodeToWebProxies(
			job.sourcePath,
			renditions,
			details.frameRateExpression
		)
	} catch (error) {
		await discardLocalRenditions(renditions)
		throw error
	}

	const storedUrls: string[] = []
	try {
		const proxyUrl = await storeRendition(full)
		storedUrls.push(proxyUrl)
		const proxyLowUrl = low ? await storeRendition(low) : null
		if (proxyLowUrl) storedUrls.push(proxyLowUrl)
		const thumbnailUrl = job.needsPoster ? await buildPoster(job) : null
		if (thumbnailUrl) storedUrls.push(thumbnailUrl)

		const version = await prisma.imageVersion.update({
			where: { id: job.versionId },
			data: {
				proxyUrl,
				proxyLowUrl,
				proxyStatus: ProxyStatus.READY,
				...(duration !== null ? { duration } : {}),
				...(details.frameRate !== null ? { frameRate: details.frameRate } : {}),
				...(details.startTimecode ? { startTimecode: details.startTimecode } : {}),
				...(thumbnailUrl ? { thumbnailUrl } : {}),
			},
			include: { image: { select: { projectId: true } } },
		})

		await recordProjectAssets(
			[
				{ url: proxyUrl, kind: "PROXY", imageVersionId: version.id },
				{ url: proxyLowUrl, kind: "PROXY", imageVersionId: version.id },
				{ url: thumbnailUrl, kind: "THUMBNAIL", imageVersionId: version.id },
			],
			version.image.projectId
		)
		emitVersionUpdated(version)
	} catch (error) {
		await Promise.all(storedUrls.map((url) => storage.remove(url)))
		await discardLocalRenditions(renditions)
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
