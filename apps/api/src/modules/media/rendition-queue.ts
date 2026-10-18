import fs from "fs/promises"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"
import { randomUUID } from "crypto"
import { ImageVersion, ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { io } from "../../realtime/socket"
import { uploadsDir } from "../../storage"

const INSTANCE_ID_FILE = ".instance-id"

const persistedInstanceId = (): string => {
	const idFile = path.join(uploadsDir, INSTANCE_ID_FILE)
	try {
		const existing = readFileSync(idFile, "utf8").trim()
		if (existing) return existing
	} catch {
		mkdirSync(uploadsDir, { recursive: true })
	}
	const created = randomUUID()
	try {
		writeFileSync(idFile, created)
	} catch (error) {
		logger.warn("Could not persist the instance id, renditions will not survive a restart", {
			detail: error instanceof Error ? error.message : undefined,
		})
	}
	return created
}

export const INSTANCE_ID = process.env.SCULPT_INSTANCE_ID || persistedInstanceId()

export const processingRoot = path.join(uploadsDir, ".processing")

export const processingDir = path.join(processingRoot, INSTANCE_ID)

const SOURCE_PREFIX = "source-"

export const durableSourcePath = (versionId: string, extension: string): string =>
	path.join(processingDir, `${SOURCE_PREFIX}${versionId}${extension}`)

export const versionIdOfSource = (fileName: string): string | null => {
	if (!fileName.startsWith(SOURCE_PREFIX)) return null
	const withoutPrefix = fileName.slice(SOURCE_PREFIX.length)
	const versionId = withoutPrefix.slice(
		0,
		withoutPrefix.length - path.extname(withoutPrefix).length
	)
	return versionId || null
}

export interface RenditionJob {
	versionId: string
	sourcePath: string
}

export const emitVersionUpdated = (version: ImageVersion): void => {
	io.to(`imageVersion:${version.id}`).emit("version-updated", {
		id: version.id,
		imageId: version.imageId,
		proxyUrl: version.proxyUrl,
		proxyLowUrl: version.proxyLowUrl,
		proxyStatus: version.proxyStatus,
		duration: version.duration,
		frameRate: version.frameRate,
		startTimecode: version.startTimecode,
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

const adoptSource = async <TJob extends RenditionJob>(job: TJob): Promise<TJob> => {
	const durablePath = durableSourcePath(job.versionId, path.extname(job.sourcePath))
	if (job.sourcePath === durablePath) return job
	try {
		await fs.mkdir(processingDir, { recursive: true })
		await fs.rename(job.sourcePath, durablePath)
		return { ...job, sourcePath: durablePath }
	} catch (error) {
		logger.warn("Could not move rendition source to its durable path", {
			versionId: job.versionId,
			detail: error instanceof Error ? error.message : undefined,
		})
		return job
	}
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
	let preparing = 0
	let active = 0

	const execute = async (job: TJob): Promise<void> => {
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

	const admit = async (job: TJob): Promise<void> => {
		const adopted = await adoptSource(job)
		await claimJob(adopted.versionId)
		waiting.push(adopted)
		logger.debug("Queued media rendition", {
			queue: options.name,
			depth: waiting.length + active,
		})
		drain()
	}

	return {
		enqueue: (job: TJob) => {
			preparing += 1
			void admit(job).finally(() => {
				preparing -= 1
			})
		},
		depth: () => preparing + waiting.length + active,
	}
}
