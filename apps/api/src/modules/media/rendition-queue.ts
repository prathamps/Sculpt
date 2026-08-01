import fs from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { ImageVersion, ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { io } from "../../realtime/socket"
import { uploadsDir } from "../../storage"

export const INSTANCE_ID = process.env.SCULPT_INSTANCE_ID || randomUUID()

const UNCLAIMED_JOB_GRACE_MS = 5 * 60000

export const processingDir = path.join(uploadsDir, ".processing", INSTANCE_ID)

export interface RenditionJob {
	versionId: string
	sourcePath: string
}

export const emitVersionUpdated = (version: ImageVersion): void => {
	io.to(`imageVersion:${version.id}`).emit("version-updated", {
		id: version.id,
		imageId: version.imageId,
		proxyUrl: version.proxyUrl,
		proxyStatus: version.proxyStatus,
		duration: version.duration,
		frameRate: version.frameRate,
		thumbnailUrl: version.thumbnailUrl,
	})
}

export const markVersionFailed = async (
	versionId: string,
	error: unknown
): Promise<void> => {
	logger.error("Media rendition failed", error, { versionId })
	try {
		const version = await prisma.imageVersion.update({
			where: { id: versionId },
			data: { proxyStatus: ProxyStatus.FAILED },
		})
		emitVersionUpdated(version)
	} catch (updateError) {
		logger.error("Could not mark rendition as failed", updateError, {
			versionId,
		})
	}
}

const claimJob = async (versionId: string): Promise<void> => {
	await prisma.imageVersion
		.update({
			where: { id: versionId },
			data: { proxyOwner: INSTANCE_ID },
		})
		.catch((error) =>
			logger.error("Could not claim rendition job", error, { versionId })
		)
}

export interface RenditionQueue<TJob extends RenditionJob> {
	enqueue: (job: TJob) => void
	depth: () => number
}

export const createRenditionQueue = <TJob extends RenditionJob>(options: {
	name: string
	concurrency: number
	run: (job: TJob) => Promise<void>
}): RenditionQueue<TJob> => {
	const waiting: TJob[] = []
	let active = 0

	const execute = async (job: TJob): Promise<void> => {
		await claimJob(job.versionId)
		try {
			await options.run(job)
		} catch (error) {
			await markVersionFailed(job.versionId, error)
		} finally {
			await fs.unlink(job.sourcePath).catch(() => undefined)
		}
	}

	const drain = (): void => {
		while (active < options.concurrency && waiting.length > 0) {
			const job = waiting.shift()
			if (!job) return
			active += 1
			void execute(job).finally(() => {
				active -= 1
				drain()
			})
		}
	}

	return {
		enqueue: (job: TJob) => {
			waiting.push(job)
			logger.debug("Queued media rendition", {
				queue: options.name,
				depth: waiting.length + active,
			})
			drain()
		},
		depth: () => waiting.length + active,
	}
}

export const failAbandonedProxyJobs = async (): Promise<void> => {
	const reclaimed = await prisma.imageVersion.updateMany({
		where: {
			proxyStatus: ProxyStatus.PENDING,
			OR: [
				{ proxyOwner: INSTANCE_ID },
				{
					proxyOwner: null,
					updatedAt: { lt: new Date(Date.now() - UNCLAIMED_JOB_GRACE_MS) },
				},
			],
		},
		data: { proxyStatus: ProxyStatus.FAILED },
	})

	if (reclaimed.count > 0) {
		logger.warn("Marked abandoned rendition jobs as failed", {
			count: reclaimed.count,
		})
	}

	await fs
		.rm(processingDir, { recursive: true, force: true })
		.catch(() => undefined)
}
