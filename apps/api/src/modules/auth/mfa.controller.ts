import { Request, Response } from "express"
import { User } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { respondWithError } from "../../lib/http"
import {
	ADMIN_SESSION_COOKIE,
	MFA_CHALLENGE_COOKIE,
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
} from "../../lib/cookies"
import { SessionKind, signMfaChallenge, verifyMfaChallenge } from "../../lib/tokens"
import { AuthenticatedRequest } from "../../types"
import { recordAudit } from "../audit/audit.service"
import {
	issueSession,
	sessionLifetimeMs,
	isSessionRevoked,
	revokeTokenId,
} from "./session.service"
import {
	clearFailedAttempts,
	isLocked,
	lockedOutMessage,
	recordFailedAttempt,
} from "./credentials.service"
import {
	beginEnrollment,
	completeEnrollment,
	disableMfa,
	hasMfa,
	mfaStatus,
	regenerateRecoveryCodes,
	verifySecondFactor,
} from "./mfa.service"

const MFA_CHALLENGE_LIFETIME_MS = 5 * 60000

type SignInSubject = Pick<
	User,
	"id" | "tokenVersion" | "totpEnabledAt" | "failedLoginCount" | "lockedUntil"
>

const SESSION_COOKIE_NAMES: Record<SessionKind, string> = {
	user: SESSION_COOKIE,
	admin: ADMIN_SESSION_COOKIE,
}

const SIGN_IN_ACTIONS = {
	user: "user.login_succeeded",
	admin: "admin.login_succeeded",
} as const

export const issueSessionCookie = (
	res: Response,
	subject: { id: string; tokenVersion: number },
	kind: SessionKind
): void => {
	setSessionCookie(
		res,
		SESSION_COOKIE_NAMES[kind],
		issueSession(subject, kind).token,
		sessionLifetimeMs(kind)
	)
}

export const completeSignIn = async (
	res: Response,
	user: SignInSubject,
	kind: SessionKind,
	method: string
): Promise<void> => {
	await clearFailedAttempts(user)
	issueSessionCookie(res, user, kind)
	await recordAudit({
		action: SIGN_IN_ACTIONS[kind],
		targetType: "user",
		targetId: user.id,
		actorId: user.id,
		metadata: { method, mfa: hasMfa(user) },
	})
}

export const beginSignIn = async (
	res: Response,
	user: SignInSubject,
	kind: SessionKind,
	method: string
): Promise<"challenge" | "session"> => {
	if (!hasMfa(user)) {
		await completeSignIn(res, user, kind, method)
		return "session"
	}
	setSessionCookie(
		res,
		MFA_CHALLENGE_COOKIE,
		signMfaChallenge(user, kind, MFA_CHALLENGE_LIFETIME_MS),
		MFA_CHALLENGE_LIFETIME_MS
	)
	return "challenge"
}

export const verifyMfaChallengeHandler = async (req: Request, res: Response) => {
	try {
		const challenge = verifyMfaChallenge(req.cookies?.[MFA_CHALLENGE_COOKIE])
		if (!challenge || (await isSessionRevoked(challenge.jti))) {
			return res.status(401).json({
				message: "Your sign-in attempt expired. Enter your password again.",
			})
		}

		const user = await prisma.user.findUnique({ where: { id: challenge.id } })
		if (!user || user.tokenVersion !== challenge.ver) {
			return res.status(401).json({
				message: "Your sign-in attempt expired. Enter your password again.",
			})
		}
		if (isLocked(user)) {
			return res.status(429).json({ message: lockedOutMessage(user.lockedUntil as Date) })
		}

		const method = await verifySecondFactor(user.id, {
			code: req.body.code,
			recoveryCode: req.body.recoveryCode,
		})
		if (!method) {
			await recordAudit({
				action: "user.mfa_challenge_failed",
				targetType: "user",
				targetId: user.id,
				actorId: user.id,
				metadata: { purpose: challenge.purpose },
			})
			const lockedUntil = await recordFailedAttempt(user.id)
			if (lockedUntil) {
				clearSessionCookie(res, MFA_CHALLENGE_COOKIE)
				return res.status(429).json({ message: lockedOutMessage(lockedUntil) })
			}
			return res.status(401).json({ message: "That code is not valid." })
		}

		await revokeTokenId(challenge.jti, user.id, MFA_CHALLENGE_LIFETIME_MS)
		clearSessionCookie(res, MFA_CHALLENGE_COOKIE)
		await completeSignIn(res, user, challenge.purpose, method)
		return res.status(200).json({ message: "Signed in", kind: challenge.purpose })
	} catch (error) {
		return respondWithError(res, error, "verify two-factor code")
	}
}

const reissueCurrentSession = async (res: Response, userId: string): Promise<void> => {
	const refreshed = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: { id: true, tokenVersion: true },
	})
	issueSessionCookie(res, refreshed, "user")
}

export const getMfaStatus = async (req: AuthenticatedRequest, res: Response) => {
	try {
		return res.status(200).json(await mfaStatus(req.user!.id))
	} catch (error) {
		return respondWithError(res, error, "read two-factor status")
	}
}

export const startMfaSetup = async (req: AuthenticatedRequest, res: Response) => {
	try {
		return res.status(200).json(await beginEnrollment(req.user!.id))
	} catch (error) {
		return respondWithError(res, error, "start two-factor setup")
	}
}

export const enableMfa = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const recoveryCodes = await completeEnrollment(req.user!.id, req.body.code)
		await reissueCurrentSession(res, req.user!.id)
		return res.status(200).json({ recoveryCodes })
	} catch (error) {
		return respondWithError(res, error, "turn on two-factor authentication")
	}
}

export const regenerateMfaRecoveryCodes = async (
	req: AuthenticatedRequest,
	res: Response
) => {
	try {
		const recoveryCodes = await regenerateRecoveryCodes(req.user!.id, {
			code: req.body.code,
			recoveryCode: req.body.recoveryCode,
		})
		return res.status(200).json({ recoveryCodes })
	} catch (error) {
		return respondWithError(res, error, "regenerate recovery codes")
	}
}

export const disableMfaHandler = async (req: AuthenticatedRequest, res: Response) => {
	try {
		await disableMfa(req.user!.id, {
			password: req.body.password,
			code: req.body.code,
			recoveryCode: req.body.recoveryCode,
		})
		await reissueCurrentSession(res, req.user!.id)
		return res.status(200).json({ message: "Two-factor authentication is off." })
	} catch (error) {
		return respondWithError(res, error, "turn off two-factor authentication")
	}
}
