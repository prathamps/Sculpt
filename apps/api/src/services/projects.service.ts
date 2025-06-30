import { prisma } from "../lib/prisma"
import { Project, User, ProjectRole } from "@prisma/client"

export const createProject = async (
	name: string,
	ownerId: string
): Promise<Project> => {
	return prisma.project.create({
		data: {
			name,
			members: {
				create: {
					userId: ownerId,
					role: ProjectRole.OWNER,
				},
			},
		},
	})
}

export const getProjectsForUser = async (
	userId: string
): Promise<Project[]> => {
	return prisma.project.findMany({
		where: {
			members: {
				some: {
					userId: userId,
				},
			},
		},
		include: {
			images: true, // include images for the dashboard cards
		},
	})
}

export const getProjectById = async (
	projectId: string,
	userId: string
): Promise<Project | null> => {
	return prisma.project.findFirst({
		where: {
			id: projectId,
			members: {
				some: {
					userId: userId,
				},
			},
		},
		include: {
			images: true,
			members: {
				include: {
					user: true,
				},
			},
		},
	})
}

export const inviteUserToProject = async (
	projectId: string,
	userEmail: string
): Promise<Project | null> => {
	const userToInvite = await prisma.user.findUnique({
		where: { email: userEmail },
	})

	if (!userToInvite) {
		throw new Error("User to invite not found.")
	}

	await prisma.projectMember.create({
		data: {
			projectId: projectId,
			userId: userToInvite.id,
			role: ProjectRole.MEMBER,
		},
	})

	return prisma.project.findUnique({
		where: { id: projectId },
		include: {
			members: {
				include: {
					user: true,
				},
			},
		},
	})
}
