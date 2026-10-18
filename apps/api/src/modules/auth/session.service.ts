import { prisma } from "../../lib/prisma"
import { TtlCache } from "../../lib/ttl-cache"
import { forgetDelegatedUser } from "../oauth/bearer"
import { endDelegatedAccess } from "../oauth/credential-changes"
import {
	IssuedToken,
	SessionClaims,
	SessionKind,
	signSessionToken,
	verifySessionToken,
} from "../../lib/tokens"

const DEFAULT_IDLE_TIMEOUT_MINUTES = 60
const MINIMUM_IDLE_TIMEOUT_MINUTES = 5
const MAXIMUM_IDLE_TIMEOUT_MINUTES = 24 * 60

export const userSessionLifetimeMs = (): number => {
	const configured = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES)
	const minutes = Number.isFinite(configured) && configured > 0
		? Math.min(Math.max(configured, MINIMUM_IDLE_TIMEOUT_MINUTES), MAXIMUM_IDLE_TIMEOUT_MINUTES)
		: DEFAULT_IDLE_TIMEOUT_MINUTES
	return minutes * 60000
}
const VERIFIED_SESSION_CACHE_TTL_MS = 5000
export const ADMIN_SESSION_LIFETIME_MS = 8 * 3600000

const DEFAULT_ABSOLUTE_SESSION_DAYS = 7

export const absoluteSessionLifetimeMs = (): number => {
	const configured = Number(process.env.SESSION_ABSOLUTE_LIFETIME_DAYS)
	const days =
		Number.isFinite(configured) && configured > 0
			? configured
			: DEFAULT_ABSOLUTE_SESSION_DAYS
	return days * 24 * 3600000
}

export const sessionLifetimeMs = (kind: SessionKind): number =>
	kind === "admin" ? ADMIN_SESSION_LIFETIME_MS : userSessionLifetimeMs()

export const issueSession = (
	subject: { id: string; tokenVersion: number },
	kind: SessionKind,
	sessionStartedAt?: number
): IssuedToken =>
	signSessionToken(subject, kind, sessionLifetimeMs(kind), sessionStartedAt)

export const shouldSlideSession = (
	claims: SessionClaims,
	now = Date.now()
): boolean => {
	if (now - claims.sst >= absoluteSessionLifetimeMs()) return false
	if (claims.exp === undefined) return true

	const lifetime = sessionLifetimeMs(claims.typ)
	const remaining = claims.exp * 1000 - now
	return remaining <= lifetime / 2
}

export const isSessionRevoked = async (jti: string): Promise<boolean> => {
	const revoked = await prisma.revokedSession.findUnique({
		where: { jti },
		select: { jti: true },
	})
	return !!revoked
}

const findSessionUser = (userId: string) =>
	prisma.user.findUnique({ where: { id: userId } })

export type SessionUser = NonNullable<Awaited<ReturnType<typeof findSessionUser>>>

const verifiedSessions = new TtlCache<SessionUser>(VERIFIED_SESSION_CACHE_TTL_MS)

export const forgetCachedSessions = (userId: string): void => {
	verifiedSessions.deleteWhere((user) => user.id === userId)
	forgetDelegatedUser(userId)
}

export const clearSessionCache = (): void => verifiedSessions.clear()

export const userForSession = async (
	claims: Pick<SessionClaims, "id" | "jti" | "ver">
): Promise<SessionUser | null> => {
	const cached = verifiedSessions.get(claims.jti)
	if (cached) return cached.tokenVersion === claims.ver ? cached : null

	if (await isSessionRevoked(claims.jti)) return null
	const user = await findSessionUser(claims.id)
	if (!user || user.tokenVersion !== claims.ver) return null

	verifiedSessions.set(claims.jti, user)
	return user
}

export const revokeSession = async (claims: SessionClaims): Promise<void> => {
	verifiedSessions.delete(claims.jti)
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

export const revokeTokenId = async (
	jti: string,
	userId: string,
	lifetimeMs: number
): Promise<void> => {
	verifiedSessions.delete(jti)
	await prisma.revokedSession.upsert({
		where: { jti },
		update: {},
		create: { jti, userId, expiresAt: new Date(Date.now() + lifetimeMs) },
	})
}

export const revokeAllSessionsForUser = async (
	userId: string
): Promise<void> => {
	await prisma.user.update({
		where: { id: userId },
		data: { tokenVersion: { increment: 1 } },
	})
	forgetCachedSessions(userId)
	await endDelegatedAccess(userId, "signed_out_everywhere")
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
