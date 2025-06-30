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
