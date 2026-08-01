import { NextFunction, Request, RequestHandler, Response } from "express"
import { ProjectRole } from "@prisma/client"
import { AuthenticatedUser } from "../types"
import {
	getCommentProjectId,
	getImageProjectId,
	getMemberRole,
	getVersionProjectId,
	roleMeets,
} from "../modules/projects/access"

export type ProjectIdResolver = (
	req: Request
) => Promise<string | null> | string | null

export const projectIdFromParam =
	(param = "projectId"): ProjectIdResolver =>
	(req) =>
		req.params[param] ?? null

export const projectIdFromImageParam =
	(param = "imageId"): ProjectIdResolver =>
	(req) =>
		getImageProjectId(req.params[param])

export const projectIdFromVersionParam =
	(param = "versionId"): ProjectIdResolver =>
	(req) =>
		getVersionProjectId(req.params[param])

export const projectIdFromCommentParam =
	(param = "commentId"): ProjectIdResolver =>
	(req) =>
		getCommentProjectId(req.params[param])

export interface AuthorizedScope {
	userId: string
	projectId: string
	role: ProjectRole
}

const SCOPE_KEY = "authorizedScope"

export const authorizedScope = (res: Response): AuthorizedScope => {
	const scope = res.locals[SCOPE_KEY] as AuthorizedScope | undefined
	if (!scope) {
		throw new Error(
			"Route handler ran without requireProjectRole authorization middleware"
		)
	}
	return scope
}

export const requireProjectRole = (
	minimum: ProjectRole,
	resolveProjectId: ProjectIdResolver
): RequestHandler =>
	async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const userId = (req.user as AuthenticatedUser | undefined)?.id
		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		const projectId = await resolveProjectId(req)
		if (!projectId) {
			res.status(404).json({ message: "Not found" })
			return
		}

		const role = await getMemberRole(projectId, userId)
		if (!role) {
			res.status(403).json({ message: "You are not a member of this project" })
			return
		}
		if (!roleMeets(role, minimum)) {
			res.status(403).json({ message: "Your project role does not allow this" })
			return
		}

		res.locals[SCOPE_KEY] = { userId, projectId, role }
		next()
	}
