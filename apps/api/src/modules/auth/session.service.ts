import { prisma } from "../../lib/prisma"
import {
	IssuedToken,
	SessionClaims,
	SessionKind,
	signSessionToken,
	verifySessionToken,
} from "../../lib/tokens"

export const USER_SESSION_LIFETIME_MS = 3600000
export const ADMIN_SESSION_LIFETIME_MS = 8 * 3600000

export const issueSession = (
	subject: { id: string; tokenVersion: number },
	kind: SessionKind
): IssuedToken =>
	signSessionToken(
		subject,
		kind,
		kind === "admin" ? ADMIN_SESSION_LIFETIME_MS : USER_SESSION_LIFETIME_MS
	)

export const isSessionRevoked = async (jti: string): Promise<boolean> => {
	const revoked = await prisma.revokedSession.findUnique({
		where: { jti },
		select: { jti: true },
	})
	return !!revoked
}

export const revokeSession = async (claims: SessionClaims): Promise<void> => {
	await prisma.revokedSession.upsert({
		where: { jti: claims.jti },
		update: {},
		create: {
			jti: claims.jti,
			userId: claims.id,
			expiresAt: new Date(Date.now() + ADMIN_SESSION_LIFETIME_MS),
		},
	})
}

export const revokeAllSessionsForUser = async (
	userId: string
): Promise<void> => {
	await prisma.user.update({
		where: { id: userId },
		data: { tokenVersion: { increment: 1 } },
	})
}

export const pruneExpiredRevocations = async (): Promise<number> => {
	const { count } = await prisma.revokedSession.deleteMany({
		where: { expiresAt: { lt: new Date() } },
	})
	return count
}

export const authenticateSessionToken = async (
	token: string | undefined,
	kind: SessionKind
): Promise<SessionClaims | null> => {
	const claims = verifySessionToken(token, kind)
	if (!claims) return null
	if (await isSessionRevoked(claims.jti)) return null
	return claims
}
