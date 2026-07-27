import { AuthenticatedUser } from "../../types";
import { Request, Response } from "express"
import {
	getAllUsers,
	updateUserRole,
	getAllProjects,
	getProjectById,
	getDashboardStats,
} from "./admin.service"
import { loginAdmin } from "../auth/auth.service"
import { UserRole } from "@prisma/client"
import {
	listAuditLogs,
	recordAudit,
	requestIp,
} from "../audit/audit.service"
import {
	ADMIN_SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
} from "../../lib/cookies"
import { verifySessionToken } from "../../lib/tokens"
import {
	ADMIN_SESSION_LIFETIME_MS,
	issueSession,
	revokeSession,
} from "../auth/session.service"
import { respondWithError } from "../../lib/http"
import { NotFoundError } from "../../lib/errors"
import { paginated, requestedPage } from "../../lib/pagination"
import { logger } from "../../lib/logger"

export const adminLogin = async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body
		const admin = await loginAdmin(email, password)

		if (!admin) {
			await recordAudit({
				action: "admin.login_failed",
				targetType: "user",
				metadata: { email },
				ipAddress: requestIp(req),
			})
			return res.status(401).json({ message: "Invalid credentials" })
		}

		if (admin.role !== UserRole.ADMIN) {
			return res
				.status(403)
				.json({ message: "Access denied: Admin privileges required" })
		}

		const { token } = issueSession(admin, "admin")
		setSessionCookie(
			res,
			ADMIN_SESSION_COOKIE,
			token,
			ADMIN_SESSION_LIFETIME_MS
		)

		await recordAudit({
			action: "admin.login_succeeded",
			targetType: "user",
			targetId: admin.id,
			actorId: admin.id,
			ipAddress: requestIp(req),
		})

		return res.status(200).json({ message: "Admin logged in successfully" })
	} catch (error) {
		console.error("Admin login error:", error)
		return res.status(500).json({ message: "Error during admin login" })
	}
}

export const adminProfile = async (req: Request, res: Response) => {
	const admin = req.user

	if (!admin) {
		return res.status(401).json({ message: "Not authenticated" })
	}

	const { id, email, name, role, createdAt, updatedAt } = admin as AuthenticatedUser

	return res.status(200).json({
		id,
		email,
		name,
		role,
		createdAt,
		updatedAt,
	})
}

export const adminLogout = async (req: Request, res: Response) => {
	const claims = verifySessionToken(
		req.cookies?.[ADMIN_SESSION_COOKIE],
		"admin"
	)
	clearSessionCookie(res, ADMIN_SESSION_COOKIE)

	if (claims) {
		await revokeSession(claims)
		await recordAudit({
			action: "admin.logged_out",
			targetType: "user",
			targetId: claims.id,
			actorId: claims.id,
			ipAddress: requestIp(req),
		})
	}

	return res.status(200).json({ message: "Admin logged out successfully" })
}

export const getUsers = async (req: Request, res: Response) => {
	try {
		const page = requestedPage(req.query)
		const search =
			typeof req.query.search === "string" ? req.query.search.trim() : undefined
		const { users, total } = await getAllUsers(page, search || undefined)
		return res.status(200).json(paginated(users, total, page))
	} catch (error) {
		return respondWithError(res, error, "list users")
	}
}

export const changeUserRole = async (req: Request, res: Response) => {
	try {
		const { userId } = req.params
		const { role } = req.body

		if (!Object.values(UserRole).includes(role)) {
			return res.status(400).json({ message: "Invalid role" })
		}

		const updatedUser = await updateUserRole(userId, role)
		await recordAudit({
			action: "user.role_changed",
			targetType: "user",
			targetId: userId,
			actorId: (req.user as AuthenticatedUser)?.id,
			metadata: { role },
			ipAddress: requestIp(req),
		})
		return res.status(200).json(updatedUser)
	} catch (error) {
		return respondWithError(res, error, "change user role")
	}
}

export const getProjects = async (req: Request, res: Response) => {
	try {
		const page = requestedPage(req.query)
		const { projects, total } = await getAllProjects(page)
		return res.status(200).json(paginated(projects, total, page))
	} catch (error) {
		return respondWithError(res, error, "list projects")
	}
}

export const getProject = async (req: Request, res: Response) => {
	try {
		const project = await getProjectById(req.params.projectId)
		if (!project) throw new NotFoundError("Project not found")
		return res.status(200).json(project)
	} catch (error) {
		return respondWithError(res, error, "fetch project")
	}
}

export const getStats = async (_req: Request, res: Response) => {
	try {
		return res.status(200).json(await getDashboardStats())
	} catch (error) {
		return respondWithError(res, error, "fetch admin statistics")
	}
}

export const getAuditLogs = async (req: Request, res: Response) => {
	try {
		const { page, pageSize } = requestedPage(req.query)
		const result = await listAuditLogs({
			page,
			pageSize,
			action: typeof req.query.action === "string" ? req.query.action : undefined,
			actorId:
				typeof req.query.actorId === "string" ? req.query.actorId : undefined,
		})
		return res.status(200).json(result)
	} catch (error) {
		return respondWithError(res, error, "list audit logs")
	}
}
