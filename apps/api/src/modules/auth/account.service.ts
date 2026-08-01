import bcrypt from "bcrypt"
import { ProjectRole } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { ForbiddenError, ValidationError } from "../../lib/errors"
import { logger } from "../../lib/logger"
import { storage } from "../../storage"

export interface AccountExport {
	exportedAt: string
	profile: {
		id: string
		email: string
		name: string | null
		createdAt: Date
		provider: string | null
	}
	projects: { id: string; name: string; role: ProjectRole }[]
	comments: {
		id: string
		content: string
		createdAt: Date
		resolved: boolean
		imageVersionId: string
	}[]
	reviews: { imageVersionId: string; decision: string; createdAt: Date }[]
	notifications: { content: string; createdAt: Date; read: boolean }[]
}

export const exportAccountData = async (
	userId: string
): Promise<AccountExport> => {
	const [user, memberships, comments, reviews, notifications] =
		await Promise.all([
			prisma.user.findUniqueOrThrow({
				where: { id: userId },
				select: {
					id: true,
					email: true,
					name: true,
					createdAt: true,
					provider: true,
				},
			}),
			prisma.projectMember.findMany({
				where: { userId },
				select: { role: true, project: { select: { id: true, name: true } } },
			}),
			prisma.comment.findMany({
				where: { userId },
				select: {
					id: true,
					content: true,
					createdAt: true,
					resolved: true,
					imageVersionId: true,
				},
				orderBy: { createdAt: "asc" },
			}),
			prisma.review.findMany({
				where: { userId },
				select: { imageVersionId: true, decision: true, createdAt: true },
			}),
			prisma.notification.findMany({
				where: { userId },
				select: { content: true, createdAt: true, read: true },
				orderBy: { createdAt: "desc" },
			}),
		])

	return {
		exportedAt: new Date().toISOString(),
		profile: user,
		projects: memberships.map((membership) => ({
			id: membership.project.id,
			name: membership.project.name,
			role: membership.role,
		})),
		comments,
		reviews,
		notifications,
	}
}

const soleOwnedProjectIds = async (userId: string): Promise<string[]> => {
	const owned = await prisma.projectMember.findMany({
		where: { userId, role: ProjectRole.OWNER },
		select: { projectId: true },
	})

	const soleOwned: string[] = []
	for (const { projectId } of owned) {
		const owners = await prisma.projectMember.count({
			where: { projectId, role: ProjectRole.OWNER },
		})
		if (owners <= 1) soleOwned.push(projectId)
	}
	return soleOwned
}

export const deleteAccount = async (
	userId: string,
	confirmation: { password?: string; transferOrDelete: boolean }
): Promise<void> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		omit: { password: false },
	})
	if (!user) throw new ValidationError("Account not found.")

	if (user.password) {
		if (!confirmation.password) {
			throw new ValidationError(
				"Confirm your password to delete your account."
			)
		}
		const valid = await bcrypt.compare(confirmation.password, user.password)
		if (!valid) throw new ForbiddenError("That password is not correct.")
	}

	const orphanedProjects = await soleOwnedProjectIds(userId)

	if (orphanedProjects.length > 0 && !confirmation.transferOrDelete) {
		throw new ValidationError(
			`You are the only owner of ${orphanedProjects.length} project(s). Confirm deletion to remove them and their media, or transfer ownership first.`
		)
	}

	const assets = orphanedProjects.length
		? await prisma.mediaAsset.findMany({
				where: { projectId: { in: orphanedProjects } },
				select: { storedPath: true },
			})
		: []

	await prisma.$transaction([
		...(orphanedProjects.length
			? [prisma.project.deleteMany({ where: { id: { in: orphanedProjects } } })]
			: []),
		prisma.user.delete({ where: { id: userId } }),
	])

	await Promise.all(
		assets.map((asset) =>
			storage.remove(asset.storedPath).catch((error) =>
				logger.error("Failed to remove media for deleted account", error)
			)
		)
	)
}
