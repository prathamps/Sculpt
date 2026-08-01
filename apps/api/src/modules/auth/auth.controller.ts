import { Request, Response } from "express"
import { registerUser, loginUser } from "./auth.service"
import { Prisma } from "@prisma/client"
import { oauthProviders } from "./passport"
import { AuthenticatedUser } from "../../types"
import { recordAudit, requestIp } from "../audit/audit.service"
import {
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
} from "../../lib/cookies"
import { verifySessionToken } from "../../lib/tokens"
import {
	USER_SESSION_LIFETIME_MS,
	issueSession,
	revokeSession,
} from "./session.service"
import {
	completePasswordReset as completePasswordResetWithToken,
	requestPasswordReset as requestPasswordResetForEmail,
} from "./password-reset.service"
import { respondWithError } from "../../lib/http"
import { logger } from "../../lib/logger"

const FRONTEND_URL =
	process.env.FRONTEND_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"http://localhost:3000"

const setAuthCookie = (
	res: Response,
	user: { id: string; tokenVersion: number }
) => {
	const { token } = issueSession(user, "user")
	setSessionCookie(res, SESSION_COOKIE, token, USER_SESSION_LIFETIME_MS)
}

export const register = async (req: Request, res: Response) => {
	try {
		const user = await registerUser(req.body)
		await recordAudit({
			action: "user.registered",
			targetType: "user",
			targetId: user.id,
			actorId: user.id,
			ipAddress: requestIp(req),
		})
		return res.status(201).json({ message: "User created successfully", user })
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			return res.status(409).json({ message: "Email already exists." })
		}
		return res.status(500).json({ message: "Error creating user", error })
	}
}

export const login = async (req: Request, res: Response) => {
	try {
		const user = await loginUser(req.body)
		if (!user) {
			await recordAudit({
				action: "user.login_failed",
				targetType: "user",
				metadata: { email: req.body?.email },
				ipAddress: requestIp(req),
			})
			return res.status(401).json({ message: "Invalid credentials" })
		}

		setAuthCookie(res, user)
		await recordAudit({
			action: "user.login_succeeded",
			targetType: "user",
			targetId: user.id,
			actorId: user.id,
			ipAddress: requestIp(req),
		})

		return res.status(200).json({ message: "Logged in successfully" })
	} catch (error) {
		return res.status(500).json({ message: "Error logging in", error })
	}
}

export const logout = async (req: Request, res: Response) => {
	const claims = verifySessionToken(req.cookies?.[SESSION_COOKIE], "user")
	clearSessionCookie(res, SESSION_COOKIE)

	if (claims) {
		await revokeSession(claims)
		await recordAudit({
			action: "user.logged_out",
			targetType: "user",
			targetId: claims.id,
			actorId: claims.id,
			ipAddress: requestIp(req),
		})
	}

	return res.status(200).json({ message: "Logged out successfully" })
}

export const requestPasswordReset = async (req: Request, res: Response) => {
	try {
		await requestPasswordResetForEmail(req.body.email)
		await recordAudit({
			action: "user.password_reset_requested",
			targetType: "user",
			metadata: { email: req.body.email },
			ipAddress: requestIp(req),
		})
	} catch (error) {
		logger.error("Password reset request failed", error)
	}

	return res.status(202).json({
		message:
			"If an account exists for that address, we've sent a password reset link.",
	})
}

export const completePasswordReset = async (req: Request, res: Response) => {
	try {
		const userId = await completePasswordResetWithToken(
			req.body.token,
			req.body.password
		)
		await recordAudit({
			action: "user.password_reset_completed",
			targetType: "user",
			targetId: userId,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		return res
			.status(200)
			.json({ message: "Password updated. You can sign in now." })
	} catch (error) {
		return respondWithError(res, error, "complete password reset")
	}
}

export const getOAuthProviders = (_req: Request, res: Response) => {
	return res.status(200).json(oauthProviders)
}

export const oauthCallback = (req: Request, res: Response) => {
	const user = req.user as AuthenticatedUser | undefined
	if (!user) {
		return res.redirect(`${FRONTEND_URL}/login?error=oauth`)
	}
	setAuthCookie(res, user)
	void recordAudit({
		action: "user.oauth_login",
		targetType: "user",
		targetId: user.id,
		actorId: user.id,
		ipAddress: requestIp(req),
	})
	return res.redirect(`${FRONTEND_URL}/oauth/callback`)
}
