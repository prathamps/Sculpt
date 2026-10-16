import fs from "fs/promises"
import path from "path"
import { MediaType, ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { runPeriodically } from "../../lib/schedule"
import {
	INSTANCE_ID,
	emitVersionUpdated,
	processingDir,
	processingRoot,
	versionIdOfSource,
} from "./rendition-queue"
import { enqueueVideoProxy } from "./video-pipeline"
import { enqueueImageRendition } from "./image-pipeline"

export const STALE_RENDITION_MS = 10 * 60000
const HEARTBEAT_INTERVAL_MS = 60000
const SWEEP_INTERVAL_MS = 5 * 60000

const listDir = async (dir: string): Promise<string[]> =>
	fs.readdir(dir).catch(() => [] as string[])

const durableSourcesByVersion = async (): Promise<Map<string, string>> => {
	const sources = new Map<string, string>()
	for (const fileName of await listDir(processingDir)) {
		const versionId = versionIdOfSource(fileName)
		if (versionId) sources.set(versionId, path.join(processingDir, fileName))
	}
	return sources
}

const removeEverythingExcept = async (keep: Set<string>): Promise<void> => {
	for (const fileName of await listDir(processingDir)) {
		const fullPath = path.join(processingDir, fileName)
		if (keep.has(fullPath)) continue
		await fs.rm(fullPath, { recursive: true, force: true }).catch(() => undefined)
	}
}

const failVersions = async (versionIds: string[]): Promise<void> => {
	if (versionIds.length === 0) return
	await prisma.imageVersion.updateMany({
		where: { id: { in: versionIds }, proxyStatus: ProxyStatus.PENDING },
		data: { proxyStatus: ProxyStatus.FAILED },
	})
	const failed = await prisma.imageVersion.findMany({
		where: { id: { in: versionIds } },
	})
	failed.forEach(emitVersionUpdated)
}

export const resumeOwnRenditionJobs = async (): Promise<{
	resumed: number
	failed: number
}> => {
	const owned = await prisma.imageVersion.findMany({
		where: { proxyStatus: ProxyStatus.PENDING, proxyOwner: INSTANCE_ID },
		select: { id: true, mediaType: true, thumbnailUrl: true },
	})
	const sources = await durableSourcesByVersion()
	const resumable = owned.filter((version) => sources.has(version.id))
	const lost = owned.filter((version) => !sources.has(version.id))

	await removeEverythingExcept(
		new Set(resumable.map((version) => sources.get(version.id) as string))
	)
	await failVersions(lost.map((version) => version.id))

	for (const version of resumable) {
		const sourcePath = sources.get(version.id) as string
		if (version.mediaType === MediaType.VIDEO) {
			enqueueVideoProxy({
				versionId: version.id,
				sourcePath,
				needsPoster: !version.thumbnailUrl,
			})
		} else {
			enqueueImageRendition({ versionId: version.id, sourcePath })
		}
	}

	if (owned.length > 0) {
		logger.info("Recovered rendition jobs after restart", {
			resumed: resumable.length,
			failed: lost.length,
		})
	}
	return { resumed: resumable.length, failed: lost.length }
}

export const failStaleRenditionJobs = async (now = Date.now()): Promise<number> => {
	const stale = await prisma.imageVersion.findMany({
		where: {
			proxyStatus: ProxyStatus.PENDING,
			updatedAt: { lt: new Date(now - STALE_RENDITION_MS) },
			OR: [{ proxyOwner: null }, { proxyOwner: { not: INSTANCE_ID } }],
		},
		select: { id: true },
	})
	await failVersions(stale.map((version) => version.id))
	if (stale.length > 0) {
		logger.warn("Failed rendition jobs whose instance stopped responding", {
			count: stale.length,
		})
	}
	return stale.length
}

export const heartbeatOwnRenditionJobs = async (): Promise<void> => {
	await prisma.imageVersion.updateMany({
		where: { proxyStatus: ProxyStatus.PENDING, proxyOwner: INSTANCE_ID },
		data: { updatedAt: new Date() },
	})
}

export const removeAbandonedInstanceDirs = async (
	now = Date.now()
): Promise<number> => {
	let removed = 0
	for (const instanceId of await listDir(processingRoot)) {
		if (instanceId === INSTANCE_ID) continue
		const dir = path.join(processingRoot, instanceId)
		const stat = await fs.stat(dir).catch(() => null)
		if (!stat?.isDirectory() || now - stat.mtimeMs < STALE_RENDITION_MS) continue
		const stillOwned = await prisma.imageVersion.count({
			where: { proxyStatus: ProxyStatus.PENDING, proxyOwner: instanceId },
		})
		if (stillOwned > 0) continue
		await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
		removed++
	}
	return removed
}

const sweep = async (): Promise<void> => {
	await failStaleRenditionJobs()
	await removeAbandonedInstanceDirs()
}

export const startRenditionMaintenance = async (): Promise<void> => {
	try {
		await resumeOwnRenditionJobs()
		await sweep()
	} catch (error) {
		logger.error("Rendition recovery failed", error)
	}
	runPeriodically("Rendition heartbeat", HEARTBEAT_INTERVAL_MS, heartbeatOwnRenditionJobs)
	runPeriodically("Rendition sweep", SWEEP_INTERVAL_MS, sweep)
}
