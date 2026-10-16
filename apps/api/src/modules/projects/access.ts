import { prisma } from "../../lib/prisma"
import { ProjectRole } from "@prisma/client"
import { TtlCache, cachePositive } from "../../lib/ttl-cache"

export const ROLE_RANK: Record<ProjectRole, number> = {
	VIEWER: 0,
	MEMBER: 1,
	EDITOR: 2,
	OWNER: 3,
}

const MEMBERSHIP_CACHE_TTL_MS = 5000
const OWNERSHIP_CACHE_TTL_MS = 60000

const membershipRoles = new TtlCache<ProjectRole>(MEMBERSHIP_CACHE_TTL_MS)
const owningProjects = new TtlCache<string>(OWNERSHIP_CACHE_TTL_MS)

const membershipKey = (projectId: string, userId: string): string =>
	`${projectId}:${userId}`

export const forgetMembership = (projectId: string, userId?: string): void => {
	if (userId) {
		membershipRoles.delete(membershipKey(projectId, userId))
		return
	}
	membershipRoles.deleteWhere((_role, key) => key.startsWith(`${projectId}:`))
}

export const forgetMembershipsOfUser = (userId: string): void => {
	membershipRoles.deleteWhere((_role, key) => key.endsWith(`:${userId}`))
}

export const clearAccessCaches = (): void => {
	membershipRoles.clear()
	owningProjects.clear()
}

export const getMemberRole = async (
	projectId: string,
	userId: string
): Promise<ProjectRole | null> =>
	cachePositive(membershipRoles, membershipKey(projectId, userId), async () => {
		const member = await prisma.projectMember.findFirst({
			where: { projectId, userId },
			select: { role: true },
		})
		return member?.role ?? null
	})

export const roleMeets = (
	role: ProjectRole | null,
	minimum: ProjectRole
): boolean => role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum]

export const getImageProjectId = async (
	imageId: string
): Promise<string | null> =>
	cachePositive(owningProjects, `image:${imageId}`, async () => {
		const image = await prisma.image.findUnique({
			where: { id: imageId },
			select: { projectId: true },
		})
		return image?.projectId ?? null
	})

export const getVersionProjectId = async (
	versionId: string
): Promise<string | null> =>
	cachePositive(owningProjects, `version:${versionId}`, async () => {
		const version = await prisma.imageVersion.findUnique({
			where: { id: versionId },
			select: { image: { select: { projectId: true } } },
		})
		return version?.image.projectId ?? null
	})

export const getCommentProjectId = async (
	commentId: string
): Promise<string | null> =>
	cachePositive(owningProjects, `comment:${commentId}`, async () => {
		const comment = await prisma.comment.findUnique({
			where: { id: commentId },
			select: {
				imageVersion: { select: { image: { select: { projectId: true } } } },
			},
		})
		return comment?.imageVersion.image.projectId ?? null
	})

export const canViewVersion = async (
	userId: string,
	imageVersionId: string
): Promise<boolean> => {
	const projectId = await getVersionProjectId(imageVersionId)
	if (!projectId) return false
	return roleMeets(await getMemberRole(projectId, userId), "VIEWER")
}

export const canViewInternalComments = async (
	userId: string,
	imageVersionId: string
): Promise<boolean> => {
	const projectId = await getVersionProjectId(imageVersionId)
	if (!projectId) return false
	return roleMeets(await getMemberRole(projectId, userId), "EDITOR")
}

export const isProjectMember = async (
	projectId: string,
	userId: string
): Promise<boolean> => (await getMemberRole(projectId, userId)) !== null

export const isProjectOwner = async (
	projectId: string,
	userId: string
): Promise<boolean> => (await getMemberRole(projectId, userId)) === "OWNER"

export const projectIdsForUser = async (userId: string): Promise<string[]> => {
	const memberships = await prisma.projectMember.findMany({
		where: { userId },
		select: { projectId: true },
	})
	return memberships.map((membership) => membership.projectId)
}
