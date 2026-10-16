import passport from "passport"
import { Request, Response, NextFunction } from "express"
import { UserRole } from "@prisma/client"
import { prisma } from "../lib/prisma"
import {
	ADMIN_SESSION_COOKIE,
	SESSION_COOKIE,
	setSessionCookie,
} from "../lib/cookies"
import {
	sessionLifetimeMs,
	authenticateSessionToken,
	issueSession,
	shouldSlideSession,
} from "../modules/auth/session.service"
import { AuthenticatedRequest, AuthenticatedUser } from "../types"
import { recordAuditOnce } from "../modules/audit/audit.service"
import {
	MFA_ENROLLMENT_REQUIRED,
	mustEnrollBeforeContinuing,
} from "./mfa-enrollment"
import { adminMfaRequired, hasMfa } from "../modules/auth/mfa.service"

const recordAdminDenial = (req: Request, userId: string) =>
	recordAuditOnce(`${userId}:admin`, {
		action: "access.denied",
		targetType: "admin",
		actorId: userId,
		metadata: { method: req.method, path: req.originalUrl.split("?")[0] },
	})

const slideSessionCookie = (req: Request, res: Response): void => {
	const claims = req.sessionClaims
	const user = req.user as AuthenticatedUser | undefined
	if (!claims || !user) return
	if (!shouldSlideSession(claims)) return

	const { token } = issueSession(
		{ id: user.id, tokenVersion: user.tokenVersion },
		"user",
		claims.sst
	)
	setSessionCookie(res, SESSION_COOKIE, token, sessionLifetimeMs("user"))
}

export const authenticateJWT = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	passport.authenticate(
		"jwt",
		{ session: false },
		(err: Error, user: Express.User) => {
			if (err) {
				return next(err)
			}
			if (!user) {
				return res.status(401).json({ message: "Unauthorized" })
			}
			req.user = user as AuthenticatedUser
			slideSessionCookie(req, res)
			if (mustEnrollBeforeContinuing(req, user as AuthenticatedUser)) {
				return res.status(403).json({
					code: MFA_ENROLLMENT_REQUIRED,
					message: "Turn on two-factor authentication to keep using Sculpt.",
				})
			}
			next()
		}
	)(req, res, next)
}

export const authenticateAdmin = async (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction
) => {
	const claims = await authenticateSessionToken(
		req.cookies?.[ADMIN_SESSION_COOKIE],
		"admin"
	)

	if (!claims) {
		return res.status(401).json({ message: "Admin authentication required" })
	}

	const admin = await prisma.user.findUnique({ where: { id: claims.id } })

	if (!admin || admin.tokenVersion !== claims.ver) {
		return res.status(401).json({ message: "Admin session is no longer valid" })
	}

	if (admin.role !== UserRole.ADMIN) {
		await recordAdminDenial(req, admin.id)
		return res.status(403).json({ message: "Admin privileges required" })
	}

	if (adminMfaRequired() && !hasMfa(admin)) {
		return res.status(403).json({
			code: MFA_ENROLLMENT_REQUIRED,
			message:
				"Turn on two-factor authentication in your account settings before using the admin console.",
		})
	}

	req.user = admin
	return next()
}

export const adminOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	const user = req.user as AuthenticatedUser
	if (!user || user.role !== UserRole.ADMIN) {
		if (user) void recordAdminDenial(req, user.id)
		return res.status(403).json({ message: "Forbidden: Admin access required" })
	}
	return next()
}
