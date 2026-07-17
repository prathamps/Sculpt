import { Response } from "express"
import * as projectService from "./projects.service"
import { AuthenticatedRequest, ProjectMemberWithUser } from "../../types";
import { Project, Image, ImageVersion } from "@prisma/client"
import { recordAudit, requestIp } from "../audit/audit.service"
import { AppError } from "../../lib/errors"
import { getMemberRole } from "./access"

// Extended types for the transformed data
interface ExtendedImage extends Image {
	versions?: ImageVersion[]
	latestVersion?: ImageVersion | null
}

interface ExtendedProject extends Project {
	images: ExtendedImage[]
	members: ProjectMemberWithUser[]
}

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
		res.status(500).json({ message: "Error creating project", error })
	}
}

export const getProjects = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user!.id
		let projects = (await projectService.getProjectsForUser(
			userId
		)) as unknown as ExtendedProject[]

		// Transform the projects to add latestVersion to each image
		projects = projects.map((project) => {
			const transformedImages = project.images.map((image: ExtendedImage) => {
				// Add latestVersion from the first version (already sorted desc)
				return {
					...image,
					latestVersion:
						image.versions && image.versions.length > 0
							? image.versions[0]
							: null,
				}
			})

			return {
				...project,
				images: transformedImages,
			}
		})

		res.status(200).json(projects)
	} catch (error) {
		res.status(500).json({ message: "Error fetching projects", error })
	}
}

export const getMyRole = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const role = await getMemberRole(id, req.user!.id)
		if (!role) {
			res.status(403).json({ message: "You are not a member of this project" })
			return
		}
		res.status(200).json({ role })
	} catch (error) {
		res.status(500).json({ message: "Error fetching role", error })
	}
}

export const getProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const userId = req.user!.id
		let project = (await projectService.getProjectById(
			id,
			userId
		)) as unknown as ExtendedProject
		if (!project) {
			res.status(404).json({ message: "Project not found" })
			return
		}

		// Transform the images to add latestVersion to each image
		const transformedImages = project.images.map((image: ExtendedImage) => {
			// Add latestVersion from the first version (already sorted desc)
			return {
				...image,
				latestVersion:
					image.versions && image.versions.length > 0
						? image.versions[0]
						: null,
			}
		})

		project = {
			...project,
			images: transformedImages,
		}

		res.status(200).json(project)
	} catch (error) {
		res.status(500).json({ message: "Error fetching project", error })
	}
}

export const updateProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const { name } = req.body
		const userId = req.user!.id
		const updatedProject = await projectService.updateProject(
			id,
			{ name },
			userId
		)
		await recordAudit({
			action: "project.updated",
			targetType: "project",
			targetId: id,
			actorId: userId,
			metadata: { name },
			ipAddress: requestIp(req),
		})
		res.status(200).json(updatedProject)
	} catch (error) {
		if (error instanceof Error) {
			res.status(403).json({ message: error.message })
		} else {
			res.status(500).json({ message: "An unexpected error occurred." })
		}
	}
}

export const deleteProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const userId = req.user!.id
		await projectService.deleteProject(id, userId)
		await recordAudit({
			action: "project.deleted",
			targetType: "project",
			targetId: id,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "Project not found or user not authorized") {
				res.status(403).json({ message: error.message })
			} else {
				res.status(500).json({ message: "Error deleting project", error })
			}
		}
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
		if (error instanceof Error) {
			res.status(403).json({ message: error.message })
		} else {
			res.status(500).json({ message: "An unexpected error occurred." })
		}
	}
}

export const inviteToProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const { email } = req.body
		const project = await projectService.inviteUserToProject(id, email, req.user!.id)
		await recordAudit({
			action: "project.member_invited",
			targetType: "project",
			targetId: id,
			actorId: req.user!.id,
			metadata: { invitedEmail: email },
			ipAddress: requestIp(req),
		})
		res.status(200).json(project)
	} catch (error) {
		if (error instanceof AppError) {
			res.status(error.statusCode).json({ message: error.message })
			return
		}
		if (error instanceof Error) {
			res.status(400).json({ message: error.message })
			return
		}
		res.status(500).json({ message: "An unexpected error occurred." })
	}
}

export const createShareLink = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		const { role } = req.body
		const userId = req.user!.id
		const link = await projectService.createShareLink(projectId, userId, role)
		await recordAudit({
			action: "share_link.created",
			targetType: "project",
			targetId: projectId,
			actorId: userId,
			metadata: { role },
			ipAddress: requestIp(req),
		})
		res.status(201).json(link)
	} catch (error) {
		if (error instanceof Error) {
			res.status(403).json({ message: error.message })
		} else {
			res.status(500).json({ message: "An unexpected error occurred." })
		}
	}
}

export const getShareLinks = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		const userId = req.user!.id
		const links = await projectService.getShareLinks(projectId, userId)
		res.status(200).json(links)
	} catch (error) {
		if (error instanceof Error) {
			res.status(403).json({ message: error.message })
		} else {
			res.status(500).json({ message: "An unexpected error occurred." })
		}
	}
}

export const revokeShareLink = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { linkId } = req.params
		const userId = req.user!.id
		await projectService.revokeShareLink(linkId, userId)
		await recordAudit({
			action: "share_link.revoked",
			targetType: "share_link",
			targetId: linkId,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		if (error instanceof Error) {
			res.status(403).json({ message: error.message })
		} else {
			res.status(500).json({ message: "An unexpected error occurred." })
		}
	}
}

export const joinProjectWithShareLink = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { token } = req.params
		const userId = req.user!.id
		const project = await projectService.joinProjectWithShareLink(token, userId)
		await recordAudit({
			action: "project.member_joined_via_link",
			targetType: "project",
			targetId: project.id,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(200).json(project)
	} catch (error) {
		if (error instanceof Error) {
			res.status(404).json({ message: error.message })
		} else {
			res.status(500).json({ message: "An unexpected error occurred." })
		}
	}
}
