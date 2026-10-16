import { Response } from "express"
import * as projectService from "./projects.service"
import { AuthenticatedRequest } from "../../types"
import { recordAudit, requestIp } from "../audit/audit.service"
import { respondWithError } from "../../lib/http"
import { NotFoundError } from "../../lib/errors"
import { requestedPage } from "../../lib/pagination"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { contentPolicyFor } from "./content-policy"
import {
	isEmailConfigured,
	sendProjectInvitationEmail,
} from "../notifications/email.service"
import * as notificationService from "../notifications/notification.service"
import { logger } from "../../lib/logger"

const frontendUrl = (): string =>
	(
		process.env.FRONTEND_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		"http://localhost:3000"
	).replace(/\/+$/, "")

export const createProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { name } = req.body
		const ownerId = req.user!.id
		const project = await projectService.createProject(name, ownerId)
		await recordAudit({
			action: "project.created",
			targetType: "project",
			targetId: project.id,
			actorId: ownerId,
			metadata: { name },
			ipAddress: requestIp(req),
		})
		res.status(201).json(project)
	} catch (error) {
		respondWithError(res, error, "create project")
	}
}

export const getProjects = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const page = requestedPage(req.query)
		const { projects, total } = await projectService.getProjectsForUser(
			req.user!.id,
			page
		)
		res.status(200).json({
			items: projects,
			total,
			page: page.page,
			pageSize: page.pageSize,
			totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
		})
	} catch (error) {
		respondWithError(res, error, "list projects")
	}
}

export const getMyRole = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { role, projectId } = authorizedScope(res)
		const policy = await contentPolicyFor(projectId)
		res.status(200).json({
			role,
			allowDownloads: policy?.allowDownloads ?? true,
			watermarkViewers: policy?.watermarkViewers ?? false,
		})
	} catch (error) {
		respondWithError(res, error, "fetch project role")
	}
}

export const getProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const project = await projectService.getProjectById(
			req.params.id,
			req.user!.id
		)
		if (!project) throw new NotFoundError("Project not found")
		res.status(200).json(project)
	} catch (error) {
		respondWithError(res, error, "fetch project")
	}
}

export const getMembers = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const members = await projectService.listProjectMembers(
			req.params.projectId,
			req.user!.id
		)
		res.status(200).json(members)
	} catch (error) {
		respondWithError(res, error, "list project members")
	}
}

export const updateProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		const { name, allowDownloads, watermarkViewers } = req.body
		const updated = await projectService.updateProject(
			req.params.id,
			{ name, allowDownloads, watermarkViewers },
			userId
		)
		if (name !== undefined) {
			await recordAudit({
				action: "project.updated",
				targetType: "project",
				targetId: req.params.id,
				actorId: userId,
				metadata: { name },
			})
		}
		if (allowDownloads !== undefined || watermarkViewers !== undefined) {
			await recordAudit({
				action: "project.settings_changed",
				targetType: "project",
				targetId: req.params.id,
				actorId: userId,
				metadata: {
					allowDownloads: updated.allowDownloads,
					watermarkViewers: updated.watermarkViewers,
				},
			})
		}
		res.status(200).json(updated)
	} catch (error) {
		respondWithError(res, error, "rename project")
	}
}

export const deleteProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		await projectService.deleteProject(req.params.id, userId)
		await recordAudit({
			action: "project.deleted",
			targetType: "project",
			targetId: req.params.id,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "delete project")
	}
}

export const removeMemberFromProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { projectId, userId } = req.params
		const requesterId = req.user!.id
		await projectService.removeUserFromProject(projectId, userId, requesterId)
		await recordAudit({
			action: "project.member_removed",
			targetType: "project",
			targetId: projectId,
			actorId: requesterId,
			metadata: { removedUserId: userId },
			ipAddress: requestIp(req),
		})
		res.status(200).json({ message: "Member removed successfully." })
	} catch (error) {
		respondWithError(res, error, "remove project member")
	}
}

export const changeMemberRole = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { projectId, userId } = req.params
		const { role } = req.body
		const requesterId = req.user!.id
		const { previousRole } = await projectService.changeMemberRole(
			projectId,
			userId,
			role,
			requesterId
		)
		await recordAudit({
			action: "project.member_role_changed",
			targetType: "project",
			targetId: projectId,
			actorId: requesterId,
			metadata: { targetUserId: userId, previousRole, role },
			ipAddress: requestIp(req),
		})
		res.status(200).json({ message: "Role updated." })
	} catch (error) {
		respondWithError(res, error, "change member role")
	}
}

export const inviteToProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const { email, role } = req.body
		const inviter = req.user!
		const result = await projectService.inviteUserToProject(
			id,
			email,
			inviter.id,
			role
		)

		const project = await projectService.getProjectById(id, inviter.id)
		const projectName = project?.name ?? "a Sculpt project"
		const acceptUrl = `${frontendUrl()}/invitations/${result.token}`

		await sendProjectInvitationEmail({
			to: result.email,
			inviterName: inviter.name,
			projectName,
			acceptUrl,
			isExistingUser: result.invitedExistingUser,
		})

		if (result.invitedUserId) {
			await notificationService.createNotification({
				userId: result.invitedUserId,
				content: `${inviter.name || "Someone"} invited you to join "${projectName}"`,
				metadata: { type: "project_invitation", projectId: id },
			}).catch((error) =>
				logger.error("Project invitation notification failed", error)
			)
		}

		await recordAudit({
			action: result.invitedExistingUser
				? "project.member_invited"
				: "project.invitation_sent",
			targetType: "project",
			targetId: id,
			actorId: inviter.id,
			metadata: { invitedEmail: result.email, role: role ?? "MEMBER" },
			ipAddress: requestIp(req),
		})

		res.status(200).json({
			invitedExistingUser: result.invitedExistingUser,
			email: result.email,
			token: result.token,
			acceptUrl,
			emailDelivered: isEmailConfigured(),
			project,
		})
	} catch (error) {
		respondWithError(res, error, "invite project member")
	}
}

export const leaveProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		const userId = req.user!.id
		await projectService.leaveProject(projectId, userId)
		await recordAudit({
			action: "project.member_left",
			targetType: "project",
			targetId: projectId,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "leave project")
	}
}

export const acceptInvitation = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const user = req.user!
		const project = await projectService.acceptInvitation(
			req.params.token,
			user.id,
			user.email
		)
		await recordAudit({
			action: "project.member_joined_via_link",
			targetType: "project",
			targetId: project.id,
			actorId: user.id,
			metadata: { via: "invitation" },
			ipAddress: requestIp(req),
		})
		res.status(200).json(project)
	} catch (error) {
		await recordAudit({
			action: "project.invitation_accept_failed",
			targetType: "invitation",
			actorId: req.user?.id ?? null,
			metadata: { reason: error instanceof Error ? error.message : "unknown" },
		})
		respondWithError(res, error, "accept invitation")
	}
}

export const getInvitations = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const invitations = await projectService.listInvitations(
			req.params.projectId,
			req.user!.id
		)
		res.status(200).json(invitations)
	} catch (error) {
		respondWithError(res, error, "list invitations")
	}
}

export const revokeInvitation = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		await projectService.revokeInvitation(
			req.params.invitationId,
			req.user!.id
		)
		await recordAudit({
			action: "project.invitation_revoked",
			targetType: "invitation",
			targetId: req.params.invitationId,
			actorId: req.user!.id,
			metadata: { projectId: req.params.projectId },
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "revoke invitation")
	}
}

export const createShareLink = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		const userId = req.user!.id
		const link = await projectService.createShareLink(projectId, userId, {
			role: req.body.role,
			expiresInDays: req.body.expiresInDays,
			maxUses: req.body.maxUses ?? null,
		})
		await recordAudit({
			action: "share_link.created",
			targetType: "project",
			targetId: projectId,
			actorId: userId,
			metadata: {
				linkId: link.id,
				role: link.role,
				expiresAt: link.expiresAt?.toISOString() ?? null,
				maxUses: link.maxUses,
			},
			ipAddress: requestIp(req),
		})
		res.status(201).json(link)
	} catch (error) {
		respondWithError(res, error, "create share link")
	}
}

export const getShareLinks = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const links = await projectService.getShareLinks(
			req.params.projectId,
			req.user!.id
		)
		res.status(200).json(links)
	} catch (error) {
		respondWithError(res, error, "list share links")
	}
}

export const revokeShareLink = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		await projectService.revokeShareLink(req.params.linkId, userId)
		await recordAudit({
			action: "share_link.revoked",
			targetType: "share_link",
			targetId: req.params.linkId,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "revoke share link")
	}
}

export const joinProjectWithShareLink = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		const project = await projectService.joinProjectWithShareLink(
			req.params.token,
			userId
		)
		await recordAudit({
			action: "project.member_joined_via_link",
			targetType: "project",
			targetId: project.id,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(200).json(project)
	} catch (error) {
		await recordAudit({
			action: "share_link.join_failed",
			targetType: "share_link",
			actorId: req.user?.id ?? null,
			metadata: { reason: error instanceof Error ? error.message : "unknown" },
		})
		respondWithError(res, error, "join project via share link")
	}
}
