import fs from "fs/promises"
import path from "path"
import { ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import { renderBrowserSafeImage } from "./ffmpeg"
import {
	RenditionJob,
	createRenditionQueue,
	emitVersionUpdated,
	processingDir,
} from "./rendition-queue"
import { recordProjectAssets } from "./media-access.service"

export type ImageRenditionJob = RenditionJob

const DEFAULT_IMAGE_CONCURRENCY = 2

const imageConcurrency = (): number =>
	Math.max(
		1,
		Number(process.env.IMAGE_WORKER_CONCURRENCY) || DEFAULT_IMAGE_CONCURRENCY
	)

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
			include: { image: { select: { projectId: true } } },
		})

		await recordProjectAssets([proxyUrl], version.image.projectId)
		emitVersionUpdated(version)
	} catch (error) {
		await storage.remove(proxyUrl)
		throw error
	}
}

const queue = createRenditionQueue<ImageRenditionJob>({
	name: "image-rendition",
	concurrency: imageConcurrency(),
	run: buildRendition,
})

export const enqueueImageRendition = (job: ImageRenditionJob): void =>
	queue.enqueue(job)

export const imageQueueDepth = (): number => queue.depth()
