import { prisma } from "../lib/prisma"
import { Project, User, ProjectRole, ShareLink } from "@prisma/client"
import { randomBytes } from "crypto"

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
			members: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
				},
			},
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

export const deleteProject = async (
	projectId: string,
	userId: string
): Promise<void> => {
	const project = await prisma.project.findFirst({
		where: {
			id: projectId,
			members: { some: { userId, role: "OWNER" } },
		},
	})

	if (!project) {
		throw new Error("Project not found or user not authorized")
	}

	await prisma.project.delete({
		where: {
			id: projectId,
		},
	})
}

export const removeUserFromProject = async (
	projectId: string,
	userIdToRemove: string,
	requesterId: string
): Promise<void> => {
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: { members: true },
	})

	if (!project) {
		throw new Error("Project not found.")
	}

	const requesterMembership = project.members.find(
		(m) => m.userId === requesterId
	)
	if (!requesterMembership || requesterMembership.role !== "OWNER") {
		throw new Error("Only project owners can remove members.")
	}

	const memberToRemove = project.members.find(
		(m) => m.userId === userIdToRemove
	)
	if (!memberToRemove) {
		throw new Error("Member not found in this project.")
	}

	if (memberToRemove.role === "OWNER") {
		throw new Error("Cannot remove the project owner.")
	}

	await prisma.projectMember.delete({
		where: {
			id: memberToRemove.id,
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

export const updateProject = async (
	projectId: string,
	data: { name?: string },
	userId: string
): Promise<Project> => {
	const project = await prisma.project.findFirst({
		where: {
			id: projectId,
			members: { some: { userId, role: "OWNER" } },
		},
	})

	if (!project) {
		throw new Error("Project not found or user not authorized")
	}

	return prisma.project.update({
		where: { id: projectId },
		data,
	})
}

export const createShareLink = async (
	projectId: string,
	userId: string,
	role: ProjectRole
): Promise<ShareLink> => {
	const member = await prisma.projectMember.findFirst({
		where: { projectId, userId, role: "OWNER" },
	})
	if (!member) {
		throw new Error("Only project owners can create share links.")
	}

	if (role === "OWNER") {
		throw new Error("Cannot create share links for the OWNER role.")
	}

	const token = randomBytes(16).toString("hex")

	return prisma.shareLink.create({
		data: {
			token,
			projectId,
			role,
		},
	})
}

export const getShareLinks = async (
	projectId: string,
	userId: string
): Promise<ShareLink[]> => {
	const member = await prisma.projectMember.findFirst({
		where: { projectId, userId, role: "OWNER" },
	})
	if (!member) {
		throw new Error("Only project owners can view share links.")
	}
	return prisma.shareLink.findMany({ where: { projectId } })
}

export const revokeShareLink = async (
	linkId: string,
	userId: string
): Promise<void> => {
	const link = await prisma.shareLink.findUnique({ where: { id: linkId } })
	if (!link) {
		throw new Error("Share link not found.")
	}

	const member = await prisma.projectMember.findFirst({
		where: { projectId: link.projectId, userId, role: "OWNER" },
	})
	if (!member) {
		throw new Error("Only project owners can revoke share links.")
	}

	await prisma.shareLink.delete({ where: { id: linkId } })
}

export const joinProjectWithShareLink = async (
	token: string,
	userId: string
): Promise<Project> => {
	const link = await prisma.shareLink.findUnique({ where: { token } })
	if (!link) {
		throw new Error("Invalid or expired share link.")
	}

	// Add or update user's membership
	await prisma.projectMember.upsert({
		where: {
			projectId_userId: {
				projectId: link.projectId,
				userId: userId,
			},
		},
		update: { role: link.role }, // Update role if they are already a member
		create: {
			projectId: link.projectId,
			userId: userId,
			role: link.role,
		},
	})

	const project = await getProjectById(link.projectId, userId)
	if (!project) {
		throw new Error("Project not found after joining.") // Should not happen
	}

	return project
}
