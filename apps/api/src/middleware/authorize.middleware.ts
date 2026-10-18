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
import { recordAuditOnce } from "../modules/audit/audit.service"
import { authAllowsScope } from "../lib/request-auth"
import { scopeForMinimumRole } from "../modules/oauth/scopes"
import { declareScope, rejectForMissingScope } from "./scope.middleware"

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

const recordDenial = (
	req: Request,
	userId: string,
	projectId: string,
	minimum: ProjectRole,
	role: ProjectRole | null
) =>
	recordAuditOnce(`${userId}:${projectId}:${minimum}:${req.method}`, {
		action: "access.denied",
		targetType: "project",
		targetId: projectId,
		actorId: userId,
		metadata: {
			method: req.method,
			route: `${req.baseUrl}${req.route?.path ?? ""}`,
			requiredRole: minimum,
			role,
		},
	})

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
): RequestHandler => {
	const requiredScope = scopeForMinimumRole(minimum)
	return declareScope(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const userId = (req.user as AuthenticatedUser | undefined)?.id
		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		if (!authAllowsScope(req.auth, requiredScope)) {
			rejectForMissingScope(res, requiredScope)
			return
		}

		const projectId = await resolveProjectId(req)
		if (!projectId) {
			res.status(404).json({ message: "Not found" })
			return
		}

		const role = await getMemberRole(projectId, userId)
		if (!role) {
			await recordDenial(req, userId, projectId, minimum, role)
			res.status(403).json({ message: "You are not a member of this project" })
			return
		}
		if (!roleMeets(role, minimum)) {
			await recordDenial(req, userId, projectId, minimum, role)
			res.status(403).json({ message: "Your project role does not allow this" })
			return
		}

		res.locals[SCOPE_KEY] = { userId, projectId, role }
		next()
	}, requiredScope)
}
