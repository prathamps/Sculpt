import path from "path"
import { MediaAssetKind } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { TtlCache, cachePositive } from "../../lib/ttl-cache"

const ASSET_OWNER_CACHE_TTL_MS = 60000

export interface StoredAsset {
	projectId: string
	kind: MediaAssetKind
	imageVersionId: string | null
}

export interface AssetToRecord {
	url: string | null | undefined
	kind: MediaAssetKind
	imageVersionId?: string | null
}

const assetOwners = new TtlCache<StoredAsset>(ASSET_OWNER_CACHE_TTL_MS)

export const clearAssetOwnerCache = (): void => assetOwners.clear()

export const storedPathOf = (url: string): string | null => {
	if (!url) return null
	const withoutQuery = url.split("?")[0]
	const name = path.basename(withoutQuery)
	return name || null
}

export const versionAssets = (version: {
	id: string
	url: string
	thumbnailUrl: string | null
	proxyUrl: string | null
	proxyLowUrl?: string | null
}): AssetToRecord[] => [
	{ url: version.url, kind: "ORIGINAL", imageVersionId: version.id },
	{ url: version.proxyUrl, kind: "PROXY", imageVersionId: version.id },
	{ url: version.proxyLowUrl ?? null, kind: "PROXY", imageVersionId: version.id },
	{ url: version.thumbnailUrl, kind: "THUMBNAIL", imageVersionId: version.id },
]

export const recordProjectAssets = async (
	assets: AssetToRecord[],
	projectId: string
): Promise<void> => {
	const rows = assets
		.map((asset) => ({
			storedPath: asset.url ? storedPathOf(asset.url) : null,
			kind: asset.kind,
			imageVersionId: asset.imageVersionId ?? null,
		}))
		.filter((row): row is typeof row & { storedPath: string } => !!row.storedPath)

	if (rows.length === 0) return

	try {
		await prisma.mediaAsset.createMany({
			data: rows.map((row) => ({ ...row, projectId })),
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
	storedPaths.forEach((storedPath) => assetOwners.delete(storedPath))

	try {
		await prisma.mediaAsset.deleteMany({
			where: { storedPath: { in: storedPaths } },
		})
	} catch (error) {
		logger.error("Failed to forget media asset ownership", error)
	}
}

export const assetForStoredPath = async (
	storedPath: string
): Promise<StoredAsset | null> =>
	cachePositive(assetOwners, storedPath, async () =>
		prisma.mediaAsset.findUnique({
			where: { storedPath },
			select: { projectId: true, kind: true, imageVersionId: true },
		})
	)
