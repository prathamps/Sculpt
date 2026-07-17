import { prisma } from "../../lib/prisma"
import { ProjectRole } from "@prisma/client"

// Capability order: a role grants everything its lower-ranked roles grant.
// VIEWER reads, MEMBER comments, EDITOR manages media, OWNER manages the project.
const ROLE_RANK: Record<ProjectRole, number> = {
	VIEWER: 0,
	MEMBER: 1,
	EDITOR: 2,
	OWNER: 3,
}

export const getMemberRole = async (
	projectId: string,
	userId: string
): Promise<ProjectRole | null> => {
	const member = await prisma.projectMember.findFirst({
		where: { projectId, userId },
		select: { role: true },
	})
	return member?.role ?? null
}

export const roleMeets = (
	role: ProjectRole | null,
	minimum: ProjectRole
): boolean => role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum]

export const getImageProjectId = async (
	imageId: string
): Promise<string | null> => {
	const image = await prisma.image.findUnique({
		where: { id: imageId },
		select: { projectId: true },
	})
	return image?.projectId ?? null
}

export const getVersionProjectId = async (
	versionId: string
): Promise<string | null> => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: versionId },
		select: { image: { select: { projectId: true } } },
	})
	return version?.image.projectId ?? null
}

export const isProjectMember = async (
	projectId: string,
	userId: string
): Promise<boolean> => {
	const member = await prisma.projectMember.findFirst({
		where: { projectId, userId },
		select: { id: true },
	})
	return !!member
}

export const isProjectOwner = async (
	projectId: string,
	userId: string
): Promise<boolean> => {
	const member = await prisma.projectMember.findFirst({
		where: { projectId, userId, role: "OWNER" },
		select: { id: true },
	})
	return !!member
}
