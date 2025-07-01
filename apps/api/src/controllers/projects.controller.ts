import { Request, Response } from "express"
import * as projectService from "../services/projects.service"
import { User } from "@prisma/client"

interface AuthenticatedRequest extends Request {
	user?: User
}

export const createProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { name } = req.body
		const ownerId = req.user!.id
		const project = await projectService.createProject(name, ownerId)
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
		const projects = await projectService.getProjectsForUser(userId)
		res.status(200).json(projects)
	} catch (error) {
		res.status(500).json({ message: "Error fetching projects", error })
	}
}

export const getProject = async (
	req: AuthenticatedRequest,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const userId = req.user!.id
		const project = await projectService.getProjectById(id, userId)
		if (!project) {
			res.status(404).json({ message: "Project not found" })
			return
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
		const project = await projectService.inviteUserToProject(id, email)
		res.status(200).json(project)
	} catch (error) {
		// @ts-ignore
		res.status(500).json({ message: error.message })
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
		res.status(200).json(project)
	} catch (error) {
		if (error instanceof Error) {
			res.status(404).json({ message: error.message })
		} else {
			res.status(500).json({ message: "An unexpected error occurred." })
		}
	}
}
