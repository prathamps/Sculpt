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
import { RequestAuth, SESSION_AUTH } from "../lib/request-auth"
import { attachAuthToRequestContext } from "../lib/request-context"
import {
	authenticateBearerToken,
	bearerChallenge,
	bearerTokenOf,
	hasAuthorizationHeader,
} from "../modules/oauth/bearer"

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

export const GRANTED_SCOPES_HEADER = "X-Sculpt-Scopes"

const rejectUnenrolled = (req: Request, res: Response, user: AuthenticatedUser): boolean => {
	if (!mustEnrollBeforeContinuing(req, user)) return false
	res.status(403).json({
		code: MFA_ENROLLMENT_REQUIRED,
		message: "Turn on two-factor authentication to keep using Sculpt.",
	})
	return true
}

const establishIdentity = (req: Request, user: AuthenticatedUser, auth: RequestAuth): void => {
	req.user = user
	req.auth = auth
	attachAuthToRequestContext(auth)
}

const rejectInvalidBearer = (res: Response): void => {
	res.setHeader(
		"WWW-Authenticate",
		bearerChallenge({
			error: "invalid_token",
			description: "The access token is missing, expired, revoked or not meant for this API.",
		})
	)
	res.status(401).json({ code: "invalid_token", message: "Unauthorized" })
}

const authenticateWithBearer = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	const token = bearerTokenOf(req)
	const identity = token ? await authenticateBearerToken(token) : null
	if (!identity) {
		rejectInvalidBearer(res)
		return
	}
	establishIdentity(req, identity.user, identity.auth)
	res.setHeader(GRANTED_SCOPES_HEADER, [...(identity.auth.scopes ?? [])].join(" "))
	if (rejectUnenrolled(req, res, identity.user)) return
	next()
}

export const authenticateJWT = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	if (hasAuthorizationHeader(req)) {
		authenticateWithBearer(req, res, next).catch(next)
		return
	}
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
			establishIdentity(req, user as AuthenticatedUser, SESSION_AUTH)
			slideSessionCookie(req, res)
			if (rejectUnenrolled(req, res, user as AuthenticatedUser)) return
			next()
		}
	)(req, res, next)
}

export const authenticateAdmin = async (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction
) => {
	if (hasAuthorizationHeader(req)) {
		return res.status(401).json({
			message: "The admin console accepts only a signed-in admin session.",
		})
	}

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
