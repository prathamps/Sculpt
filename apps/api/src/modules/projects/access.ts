import { prisma } from "../../lib/prisma"

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
