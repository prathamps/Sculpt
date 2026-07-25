import fs from "fs/promises"
import path from "path"
import { ImageVersion, ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { storage, uploadsDir } from "../../storage"
import { io } from "../../realtime/socket"
import { renderBrowserSafeImage } from "./ffmpeg"

export interface ImageRenditionJob {
	versionId: string
	sourcePath: string
}

const processingDir = path.join(uploadsDir, ".processing")
const queue: ImageRenditionJob[] = []
let draining = false

export const enqueueImageRendition = (job: ImageRenditionJob): void => {
	queue.push(job)
	void drainQueue()
}

const drainQueue = async (): Promise<void> => {
	if (draining) return
	draining = true
	let job: ImageRenditionJob | undefined
	while ((job = queue.shift())) {
		try {
			await buildRendition(job)
		} catch (error) {
			await markFailed(job.versionId, error)
		}
		await fs.unlink(job.sourcePath).catch(() => undefined)
	}
	draining = false
}

const buildRendition = async (job: ImageRenditionJob): Promise<void> => {
	await fs.mkdir(processingDir, { recursive: true })
	const renditionPath = path.join(processingDir, `image-${job.versionId}.png`)
	await renderBrowserSafeImage(job.sourcePath, renditionPath)
	const proxyUrl = await storage.store({
		path: renditionPath,
		originalName: `image-${job.versionId}.png`,
		mimeType: "image/png",
	})

	try {
		const version = await prisma.imageVersion.update({
			where: { id: job.versionId },
			data: { proxyUrl, proxyStatus: ProxyStatus.READY },
		})
		emitVersionUpdated(version)
	} catch (error) {
		await storage.remove(proxyUrl)
		throw error
	}
}

const markFailed = async (
	versionId: string,
	error: unknown
): Promise<void> => {
	console.error(`Image rendition failed for version ${versionId}:`, error)
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
