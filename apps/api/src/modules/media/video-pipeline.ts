import fs from "fs/promises"
import path from "path"
import crypto from "crypto"
import { ImageVersion, ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { storage, uploadsDir } from "../../storage"
import { io } from "../../realtime/socket"
import {
	capturePosterFrame,
	probeDuration,
	transcodeToWebProxy,
} from "./ffmpeg"

export interface VideoProxyJob {
	versionId: string
	sourcePath: string
	needsPoster: boolean
}

const processingDir = path.join(uploadsDir, ".processing")
const queue: VideoProxyJob[] = []
let draining = false

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

export const enqueueVideoProxy = (job: VideoProxyJob): void => {
	queue.push(job)
	void drainQueue()
}

export const failAbandonedProxyJobs = async (): Promise<void> => {
	await prisma.imageVersion.updateMany({
		where: { proxyStatus: ProxyStatus.PENDING },
		data: { proxyStatus: ProxyStatus.FAILED },
	})
	await fs.rm(processingDir, { recursive: true, force: true }).catch(
		() => undefined
	)
}

const drainQueue = async (): Promise<void> => {
	if (draining) return
	draining = true
	let job: VideoProxyJob | undefined
	while ((job = queue.shift())) {
		try {
			await buildProxy(job)
		} catch (error) {
			await markFailed(job.versionId, error)
		}
		await discardStagedVideo(job.sourcePath)
	}
	draining = false
}

const buildProxy = async (job: VideoProxyJob): Promise<void> => {
	const proxyPath = path.join(processingDir, `proxy-${job.versionId}.mp4`)
	const duration = await probeDuration(job.sourcePath)
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
				...(thumbnailUrl ? { thumbnailUrl } : {}),
			},
		})
		emitVersionUpdated(version)
	} catch (error) {
		await storage.remove(proxyUrl)
		if (thumbnailUrl) await storage.remove(thumbnailUrl)
		throw error
	}
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

const markFailed = async (
	versionId: string,
	error: unknown
): Promise<void> => {
	console.error(`Video proxy failed for version ${versionId}:`, error)
	try {
		const version = await prisma.imageVersion.update({
			where: { id: versionId },
			data: { proxyStatus: ProxyStatus.FAILED },
		})
		emitVersionUpdated(version)
	} catch {
		return
	}
}

const emitVersionUpdated = (version: ImageVersion): void => {
	try {
		io.to(`imageVersion:${version.id}`).emit("version-updated", {
			id: version.id,
			imageId: version.imageId,
			proxyUrl: version.proxyUrl,
			proxyStatus: version.proxyStatus,
			duration: version.duration,
			thumbnailUrl: version.thumbnailUrl,
		})
	} catch (error) {
		console.error("version-updated emit failed:", error)
	}
}
