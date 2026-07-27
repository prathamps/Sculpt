import { Prisma, Project, ProjectRole, ShareLink } from "@prisma/client"
import { createHash, randomBytes } from "crypto"
import { prisma } from "../../lib/prisma"
import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import { PageRequest, skipTake } from "../../lib/pagination"
import { ROLE_RANK, getMemberRole, isProjectOwner } from "./access"

const INVITATION_TTL_MS = 7 * 24 * 3600000

const MEMBER_SELECT = {
	select: {
		id: true,
		role: true,
		createdAt: true,
		userId: true,
		user: {
			select: { id: true, name: true, email: true, avatarUrl: true },
		},
	},
} satisfies Prisma.Project$membersArgs

const LATEST_VERSION_INCLUDE = {
	versions: {
		orderBy: { versionNumber: "desc" as const },
		take: 1,
	},
	_count: { select: { versions: true } },
}

type ProjectWithMedia = Prisma.ProjectGetPayload<{
	include: {
		images: { include: typeof LATEST_VERSION_INCLUDE }
		members: typeof MEMBER_SELECT
	}
}>

const withLatestVersions = (project: ProjectWithMedia) => ({
	...project,
	images: project.images.map((image) => ({
		...image,
		latestVersion: image.versions[0] ?? null,
		versionCount: image._count.versions,
	})),
})

const requireOwner = async (
	projectId: string,
	userId: string,
	action: string
): Promise<void> => {
	if (!(await isProjectOwner(projectId, userId))) {
		throw new ForbiddenError(`Only project owners can ${action}.`)
	}
}

export const createProject = async (
	name: string,
	ownerId: string
): Promise<Project> =>
	prisma.project.create({
		data: {
			name,
			members: { create: { userId: ownerId, role: ProjectRole.OWNER } },
		},
	})

export const getProjectsForUser = async (
	userId: string,
	page?: PageRequest
): Promise<{ projects: ReturnType<typeof withLatestVersions>[]; total: number }> => {
	const where: Prisma.ProjectWhereInput = {
		members: { some: { userId } },
	}

	const [total, projects] = await Promise.all([
		prisma.project.count({ where }),
		prisma.project.findMany({
			where,
			include: {
				images: {
					include: LATEST_VERSION_INCLUDE,
					orderBy: { updatedAt: "desc" },
				},
				members: MEMBER_SELECT,
			},
			orderBy: { updatedAt: "desc" },
			...(page ? skipTake(page) : {}),
		}),
	])

	return { projects: projects.map(withLatestVersions), total }
}

export const getProjectById = async (
	projectId: string,
	userId: string
): Promise<ReturnType<typeof withLatestVersions> | null> => {
	const project = await prisma.project.findFirst({
		where: { id: projectId, members: { some: { userId } } },
		include: {
			images: {
				include: LATEST_VERSION_INCLUDE,
				orderBy: { updatedAt: "desc" },
			},
			members: MEMBER_SELECT,
		},
	})

	return project ? withLatestVersions(project) : null
}

export const updateProject = async (
	projectId: string,
	data: { name?: string },
	userId: string
): Promise<Project> => {
	await requireOwner(projectId, userId, "rename a project")
	return prisma.project.update({ where: { id: projectId }, data })
}

export const deleteProject = async (
	projectId: string,
	userId: string
): Promise<void> => {
	await requireOwner(projectId, userId, "delete a project")
	await prisma.project.delete({ where: { id: projectId } })
}

export const removeUserFromProject = async (
	projectId: string,
	userIdToRemove: string,
	requesterId: string
): Promise<void> => {
	await requireOwner(projectId, requesterId, "remove members")

	const membership = await prisma.projectMember.findUnique({
		where: { projectId_userId: { projectId, userId: userIdToRemove } },
	})

	if (!membership) {
		throw new NotFoundError("That person is not a member of this project.")
	}
	if (membership.role === ProjectRole.OWNER) {
		throw new ValidationError("Project owners cannot be removed.")
	}

	await prisma.projectMember.delete({ where: { id: membership.id } })
}

export const changeMemberRole = async (
	projectId: string,
	userIdToChange: string,
	role: ProjectRole,
	requesterId: string
): Promise<void> => {
	await requireOwner(projectId, requesterId, "change member roles")

	const membership = await prisma.projectMember.findUnique({
		where: { projectId_userId: { projectId, userId: userIdToChange } },
	})

	if (!membership) {
		throw new NotFoundError("That person is not a member of this project.")
	}

	if (membership.role === ProjectRole.OWNER && role !== ProjectRole.OWNER) {
		const owners = await prisma.projectMember.count({
			where: { projectId, role: ProjectRole.OWNER },
		})
		if (owners <= 1) {
			throw new ValidationError(
				"A project must keep at least one owner. Promote someone else first."
			)
		}
	}

	await prisma.projectMember.update({
		where: { id: membership.id },
		data: { role },
	})
}

const hashToken = (token: string): string =>
	createHash("sha256").update(token).digest("hex")

export interface InvitationResult {
	invitedExistingUser: boolean
	email: string
	token?: string
}

export const inviteUserToProject = async (
	projectId: string,
	userEmail: string,
	requesterId: string,
	role: ProjectRole = ProjectRole.MEMBER
): Promise<InvitationResult> => {
	await requireOwner(projectId, requesterId, "invite members")

	if (role === ProjectRole.OWNER) {
		throw new ValidationError("Invitations cannot grant the OWNER role.")
	}

	const email = userEmail.trim().toLowerCase()
	const existingUser = await prisma.user.findUnique({ where: { email } })

	if (existingUser) {
		const existingMembership = await prisma.projectMember.findUnique({
			where: { projectId_userId: { projectId, userId: existingUser.id } },
		})
		if (existingMembership) {
			throw new ValidationError("That person is already a member.")
		}

		await prisma.projectMember.create({
			data: { projectId, userId: existingUser.id, role },
		})

		return { invitedExistingUser: true, email }
	}

	const token = randomBytes(32).toString("hex")

	await prisma.projectInvitation.upsert({
		where: { projectId_email: { projectId, email } },
		update: {
			role,
			tokenHash: hashToken(token),
			invitedById: requesterId,
			expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
			acceptedAt: null,
		},
		create: {
			projectId,
			email,
			role,
			tokenHash: hashToken(token),
			invitedById: requesterId,
			expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
		},
	})

	return { invitedExistingUser: false, email, token }
}

export const acceptInvitation = async (
	token: string,
	userId: string,
	userEmail: string
): Promise<Project> => {
	const invitation = await prisma.projectInvitation.findUnique({
		where: { tokenHash: hashToken(token) },
	})

	if (!invitation || invitation.acceptedAt) {
		throw new NotFoundError("This invitation is no longer valid.")
	}
	if (invitation.expiresAt < new Date()) {
		throw new ValidationError("This invitation has expired.")
	}
	if (invitation.email !== userEmail.trim().toLowerCase()) {
		throw new ForbiddenError("This invitation was sent to a different address.")
	}

	await prisma.$transaction([
		prisma.projectMember.upsert({
			where: {
				projectId_userId: { projectId: invitation.projectId, userId },
			},
			update: {},
			create: {
				projectId: invitation.projectId,
				userId,
				role: invitation.role,
			},
		}),
		prisma.projectInvitation.update({
			where: { id: invitation.id },
			data: { acceptedAt: new Date() },
		}),
	])

	const project = await prisma.project.findUnique({
		where: { id: invitation.projectId },
	})
	if (!project) throw new NotFoundError("Project not found.")
	return project
}

export const listInvitations = async (
	projectId: string,
	userId: string
): Promise<
	{ id: string; email: string; role: ProjectRole; expiresAt: Date }[]
> => {
	await requireOwner(projectId, userId, "view invitations")
	return prisma.projectInvitation.findMany({
		where: { projectId, acceptedAt: null },
		select: { id: true, email: true, role: true, expiresAt: true },
		orderBy: { createdAt: "desc" },
	})
}

export const revokeInvitation = async (
	invitationId: string,
	userId: string
): Promise<void> => {
	const invitation = await prisma.projectInvitation.findUnique({
		where: { id: invitationId },
		select: { projectId: true },
	})
	if (!invitation) throw new NotFoundError("Invitation not found.")

	await requireOwner(invitation.projectId, userId, "revoke invitations")
	await prisma.projectInvitation.delete({ where: { id: invitationId } })
}

export interface ShareLinkOptions {
	role: ProjectRole
	expiresInDays?: number | null
	maxUses?: number | null
}

export const createShareLink = async (
	projectId: string,
	userId: string,
	options: ShareLinkOptions
): Promise<ShareLink> => {
	await requireOwner(projectId, userId, "create share links")

	if (options.role === ProjectRole.OWNER) {
		throw new ValidationError("Share links cannot grant the OWNER role.")
	}

	return prisma.shareLink.create({
		data: {
			token: randomBytes(32).toString("hex"),
			projectId,
			role: options.role,
			expiresAt: options.expiresInDays
				? new Date(Date.now() + options.expiresInDays * 86400000)
				: null,
			maxUses: options.maxUses ?? null,
		},
	})
}

export const getShareLinks = async (
	projectId: string,
	userId: string
): Promise<ShareLink[]> => {
	await requireOwner(projectId, userId, "view share links")
	return prisma.shareLink.findMany({
		where: { projectId, revokedAt: null },
		orderBy: { createdAt: "desc" },
	})
}

export const revokeShareLink = async (
	linkId: string,
	userId: string
): Promise<void> => {
	const link = await prisma.shareLink.findUnique({ where: { id: linkId } })
	if (!link) throw new NotFoundError("Share link not found.")

	await requireOwner(link.projectId, userId, "revoke share links")
	await prisma.shareLink.update({
		where: { id: linkId },
		data: { revokedAt: new Date() },
	})
}

const shareLinkIsUsable = (link: ShareLink): boolean => {
	if (link.revokedAt) return false
	if (link.expiresAt && link.expiresAt < new Date()) return false
	if (link.maxUses !== null && link.useCount >= link.maxUses) return false
	return true
}

export const joinProjectWithShareLink = async (
	token: string,
	userId: string
): Promise<Project> => {
	const link = await prisma.shareLink.findUnique({ where: { token } })
	if (!link || !shareLinkIsUsable(link)) {
		throw new NotFoundError("This share link is invalid, expired or used up.")
	}

	const existingRole = await getMemberRole(link.projectId, userId)

	if (!existingRole) {
		await prisma.$transaction([
			prisma.projectMember.create({
				data: { projectId: link.projectId, userId, role: link.role },
			}),
			prisma.shareLink.update({
				where: { id: link.id },
				data: { useCount: { increment: 1 } },
			}),
		])
	} else if (ROLE_RANK[link.role] > ROLE_RANK[existingRole]) {
		await prisma.projectMember.update({
			where: { projectId_userId: { projectId: link.projectId, userId } },
			data: { role: link.role },
		})
	}

	const project = await prisma.project.findUnique({
		where: { id: link.projectId },
	})
	if (!project) throw new NotFoundError("Project not found after joining.")
	return project
}
