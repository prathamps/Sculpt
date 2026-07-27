import path from "path"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"

export const storedPathOf = (url: string): string | null => {
	if (!url) return null
	const withoutQuery = url.split("?")[0]
	const name = path.basename(withoutQuery)
	return name || null
}

export const recordProjectAssets = async (
	urls: (string | null | undefined)[],
	projectId: string
): Promise<void> => {
	const storedPaths = urls
		.map((url) => (url ? storedPathOf(url) : null))
		.filter((value): value is string => !!value)

	if (storedPaths.length === 0) return

	try {
		await prisma.mediaAsset.createMany({
			data: storedPaths.map((storedPath) => ({ storedPath, projectId })),
			skipDuplicates: true,
		})
	} catch (error) {
		logger.error("Failed to record media asset ownership", error, { projectId })
	}
}

export const forgetProjectAssets = async (
	urls: (string | null | undefined)[]
): Promise<void> => {
	const storedPaths = urls
		.map((url) => (url ? storedPathOf(url) : null))
		.filter((value): value is string => !!value)

	if (storedPaths.length === 0) return

	try {
		await prisma.mediaAsset.deleteMany({
			where: { storedPath: { in: storedPaths } },
		})
	} catch (error) {
		logger.error("Failed to forget media asset ownership", error)
	}
}

export const projectIdForStoredPath = async (
	storedPath: string
): Promise<string | null> => {
	const asset = await prisma.mediaAsset.findUnique({
		where: { storedPath },
		select: { projectId: true },
	})
	return asset?.projectId ?? null
}
