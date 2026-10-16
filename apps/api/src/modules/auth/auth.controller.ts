import { Request, Response } from "express"
import { registerUser } from "./auth.service"
import { checkPassword, lockedOutMessage } from "./credentials.service"
import { beginSignIn } from "./mfa.controller"
import { Prisma } from "@prisma/client"
import { oauthProviders } from "./passport"
import { AuthenticatedUser } from "../../types"
import { recordAudit, requestIp } from "../audit/audit.service"
import { SESSION_COOKIE, clearSessionCookie } from "../../lib/cookies"
import { verifySessionToken } from "../../lib/tokens"
import { revokeSession } from "./session.service"
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
		return respondWithError(res, error, "register user")
	}
}

export const login = async (req: Request, res: Response) => {
	try {
		const check = await checkPassword(req.body.email, req.body.password)
		if (check.outcome === "locked") {
			await recordAudit({
				action: "user.login_failed",
				targetType: "user",
				metadata: { email: req.body.email, reason: "locked" },
			})
			return res.status(429).json({ message: lockedOutMessage(check.lockedUntil) })
		}
		if (check.outcome === "invalid") {
			await recordAudit({
				action: "user.login_failed",
				targetType: "user",
				targetId: check.userId,
				metadata: { email: req.body.email, reason: "invalid_credentials" },
			})
			return res.status(401).json({ message: "Invalid credentials" })
		}

		const step = await beginSignIn(res, check.user, "user", "password")
		return res.status(200).json(
			step === "challenge"
				? { mfaRequired: true, message: "Enter the code from your authenticator app." }
				: { message: "Logged in successfully" }
		)
	} catch (error) {
		return respondWithError(res, error, "log in")
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

export const oauthCallback = async (req: Request, res: Response) => {
	const user = req.user as AuthenticatedUser | undefined
	if (!user) {
		return res.redirect(`${FRONTEND_URL}/login?error=oauth`)
	}
	try {
		await recordAudit({
			action: "user.oauth_login",
			targetType: "user",
			targetId: user.id,
			actorId: user.id,
		})
		const step = await beginSignIn(res, user, "user", "oauth")
		return res.redirect(
			step === "challenge"
				? `${FRONTEND_URL}/login/two-factor`
				: `${FRONTEND_URL}/oauth/callback`
		)
	} catch (error) {
		logger.error("OAuth sign-in failed", error)
		return res.redirect(`${FRONTEND_URL}/login?error=oauth`)
	}
}
