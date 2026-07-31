import { Response } from "express"
import * as projectService from "./projects.service"
import { AuthenticatedRequest } from "../../types"
import { recordAudit, requestIp } from "../audit/audit.service"
import { respondWithError } from "../../lib/http"
import { NotFoundError } from "../../lib/errors"
import { requestedPage } from "../../lib/pagination"
import { getMemberRole } from "./access"
import { sendProjectInvitationEmail } from "../notifications/email.service"

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
		const role = await getMemberRole(req.params.id, req.user!.id)
		if (!role) {
			res.status(403).json({ message: "You are not a member of this project" })
			return
		}
		res.status(200).json({ role })
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
		const updated = await projectService.updateProject(
			req.params.id,
			{ name: req.body.name },
			userId
		)
		await recordAudit({
			action: "project.updated",
			targetType: "project",
			targetId: req.params.id,
			actorId: userId,
			metadata: { name: req.body.name },
			ipAddress: requestIp(req),
		})
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
		await projectService.changeMemberRole(projectId, userId, role, requesterId)
		await recordAudit({
			action: "project.member_role_changed",
			targetType: "project",
			targetId: projectId,
			actorId: requesterId,
			metadata: { targetUserId: userId, role },
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

		await sendProjectInvitationEmail({
			to: result.email,
			inviterName: inviter.name,
			projectName: project?.name ?? "a Sculpt project",
			acceptUrl: result.token
				? `${frontendUrl()}/invitations/${result.token}`
				: `${frontendUrl()}/project/${id}`,
			isExistingUser: result.invitedExistingUser,
		})

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
			project,
		})
	} catch (error) {
		respondWithError(res, error, "invite project member")
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
			expiresInDays: req.body.expiresInDays ?? null,
			maxUses: req.body.maxUses ?? null,
		})
		await recordAudit({
			action: "share_link.created",
			targetType: "project",
			targetId: projectId,
			actorId: userId,
			metadata: {
				role: req.body.role,
				expiresInDays: req.body.expiresInDays ?? null,
				maxUses: req.body.maxUses ?? null,
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
		respondWithError(res, error, "join project via share link")
	}
}
