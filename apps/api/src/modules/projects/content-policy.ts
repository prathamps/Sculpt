import { ProjectRole } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { TtlCache, cachePositive } from "../../lib/ttl-cache"
import { roleMeets } from "./access"

export interface ContentPolicy {
	allowDownloads: boolean
	watermarkViewers: boolean
}

export const DOWNLOAD_EXEMPT_ROLE: ProjectRole = "EDITOR"

const POLICY_CACHE_TTL_MS = 5000

const policies = new TtlCache<ContentPolicy>(POLICY_CACHE_TTL_MS)

export const forgetContentPolicy = (projectId: string): void =>
	policies.delete(projectId)

export const clearContentPolicyCache = (): void => policies.clear()

export const contentPolicyFor = async (
	projectId: string
): Promise<ContentPolicy | null> =>
	cachePositive(policies, projectId, () =>
		prisma.project.findUnique({
			where: { id: projectId },
			select: { allowDownloads: true, watermarkViewers: true },
		})
	)

export const mayDownloadOriginals = (
	policy: ContentPolicy | null,
	role: ProjectRole | null
): boolean =>
	roleMeets(role, "VIEWER") &&
	(!policy || policy.allowDownloads || roleMeets(role, DOWNLOAD_EXEMPT_ROLE))
