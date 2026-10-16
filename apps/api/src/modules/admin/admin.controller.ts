import { AuthenticatedUser } from "../../types";
import { Request, Response } from "express"
import {
	getAllUsers,
	updateUserRole,
	getAllProjects,
	getProjectById,
	getDashboardStats,
} from "./admin.service"
import { checkPassword, lockedOutMessage } from "../auth/credentials.service"
import { beginSignIn } from "../auth/mfa.controller"
import { adminMfaRequired, hasMfa } from "../auth/mfa.service"
import { UserRole } from "@prisma/client"
import {
	listAuditLogs,
	recordAudit,
	recordAuditOnce,
	requestIp,
	verifyAuditChain,
} from "../audit/audit.service"
import { writeAuditCsv } from "../audit/audit.export"
import { AuditFilters, AuditQuery } from "../audit/audit.schema"
import { ADMIN_SESSION_COOKIE, clearSessionCookie } from "../../lib/cookies"
import { verifySessionToken } from "../../lib/tokens"
import { revokeSession } from "../auth/session.service"
import { respondWithError } from "../../lib/http"
import { NotFoundError } from "../../lib/errors"
import { paginated, requestedPage } from "../../lib/pagination"

export const adminLogin = async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body
		const check = await checkPassword(email, password)

		if (check.outcome === "locked") {
			await recordAudit({
				action: "admin.login_failed",
				targetType: "user",
				metadata: { email, reason: "locked" },
			})
			return res.status(429).json({ message: lockedOutMessage(check.lockedUntil) })
		}

		if (check.outcome === "invalid" || check.user.role !== UserRole.ADMIN) {
			await recordAudit({
				action: "admin.login_failed",
				targetType: "user",
				targetId: check.outcome === "valid" ? check.user.id : check.userId,
				metadata: {
					email,
					reason: check.outcome === "valid" ? "not_an_admin" : "invalid_credentials",
				},
			})
			return res.status(401).json({ message: "Invalid credentials" })
		}

		if (adminMfaRequired() && !hasMfa(check.user)) {
			await recordAudit({
				action: "admin.login_failed",
				targetType: "user",
				targetId: check.user.id,
				metadata: { email, reason: "mfa_not_enrolled" },
			})
			return res.status(403).json({
				code: "MFA_ENROLLMENT_REQUIRED",
				message:
					"Turn on two-factor authentication in your account settings before signing in to the admin console.",
			})
		}

		const step = await beginSignIn(res, check.user, "admin", "password")
		return res.status(200).json(
			step === "challenge"
				? { mfaRequired: true, message: "Enter the code from your authenticator app." }
				: { message: "Admin logged in successfully" }
		)
	} catch (error) {
		return respondWithError(res, error, "admin login")
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
		const adminId = adminIdOf(req)
		await recordAuditOnce(`${adminId}:users:${search ?? ""}`, {
			action: "admin.users_viewed",
			targetType: "user",
			actorId: adminId,
			metadata: { search: search || null, page: page.page },
		})
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

		const { previousRole, ...updatedUser } = await updateUserRole(userId, role)
		await recordAudit({
			action: "user.role_changed",
			targetType: "user",
			targetId: userId,
			actorId: (req.user as AuthenticatedUser)?.id,
			metadata: { previousRole, role },
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
		const adminId = adminIdOf(req)
		await recordAuditOnce(`${adminId}:projects`, {
			action: "admin.projects_viewed",
			targetType: "project",
			actorId: adminId,
			metadata: { page: page.page },
		})
		return res.status(200).json(paginated(projects, total, page))
	} catch (error) {
		return respondWithError(res, error, "list projects")
	}
}

export const getProject = async (req: Request, res: Response) => {
	try {
		const project = await getProjectById(req.params.projectId)
		if (!project) throw new NotFoundError("Project not found")
		const adminId = adminIdOf(req)
		await recordAuditOnce(`${adminId}:project:${project.id}`, {
			action: "admin.project_viewed",
			targetType: "project",
			targetId: project.id,
			actorId: adminId,
		})
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

const adminIdOf = (req: Request): string | null =>
	(req.user as AuthenticatedUser | undefined)?.id ?? null

const filtersOf = (query: AuditQuery): AuditFilters => {
	const { page: _page, pageSize: _pageSize, ...filters } = query
	return filters
}

const describeFilters = (filters: AuditFilters) =>
	Object.fromEntries(
		Object.entries(filters)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])
	)

export const getAuditLogs = async (req: Request, res: Response) => {
	try {
		const query = res.locals.query as AuditQuery
		const result = await listAuditLogs(query)
		const adminId = adminIdOf(req)
		const filters = describeFilters(filtersOf(query))
		await recordAuditOnce(`${adminId}:audit:${JSON.stringify(filters)}`, {
			action: "admin.audit_viewed",
			targetType: "audit_log",
			actorId: adminId,
			metadata: { filters },
		})
		return res.status(200).json(result)
	} catch (error) {
		return respondWithError(res, error, "list audit logs")
	}
}

export const exportAuditLogs = async (req: Request, res: Response) => {
	const filters = filtersOf(res.locals.query as AuditQuery)
	try {
		await recordAudit({
			action: "admin.audit_exported",
			targetType: "audit_log",
			actorId: adminIdOf(req),
			metadata: { filters: describeFilters(filters) },
		})
		res.setHeader("Content-Type", "text/csv; charset=utf-8")
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="sculpt-audit-${new Date().toISOString().slice(0, 10)}.csv"`
		)
		await writeAuditCsv(filters, (chunk) => res.write(chunk))
		res.end()
	} catch (error) {
		if (res.headersSent) {
			res.end()
			return
		}
		respondWithError(res, error, "export audit logs")
	}
}

export const verifyAuditLogs = async (req: Request, res: Response) => {
	try {
		const result = await verifyAuditChain()
		await recordAudit({
			action: "admin.audit_verified",
			targetType: "audit_log",
			actorId: adminIdOf(req),
			metadata: { ...result },
		})
		return res.status(200).json(result)
	} catch (error) {
		return respondWithError(res, error, "verify audit logs")
	}
}
