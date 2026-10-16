import { randomUUID } from "crypto"
import jwt from "jsonwebtoken"
import { jwtSecret } from "./config"

export type SessionKind = "user" | "admin"

export interface SessionClaims {
	id: string
	typ: SessionKind
	ver: number
	jti: string
	sst: number
	exp?: number
}

export interface IssuedToken {
	token: string
	claims: SessionClaims
	expiresAt: Date
}

export const signSessionToken = (
	subject: { id: string; tokenVersion: number },
	kind: SessionKind,
	lifetimeMs: number,
	sessionStartedAt = Date.now()
): IssuedToken => {
	const claims: SessionClaims = {
		id: subject.id,
		typ: kind,
		ver: subject.tokenVersion,
		jti: randomUUID(),
		sst: sessionStartedAt,
	}
	const token = jwt.sign(claims, jwtSecret(), {
		expiresIn: Math.floor(lifetimeMs / 1000),
	})
	return { token, claims, expiresAt: new Date(Date.now() + lifetimeMs) }
}

export const verifySessionToken = (
	token: string | undefined,
	expected: SessionKind
): SessionClaims | null => {
	if (!token) return null
	try {
		const payload = jwt.verify(token, jwtSecret()) as Partial<SessionClaims>
		if (typeof payload?.id !== "string" || !payload.id) return null
		if (payload.typ !== expected) return null
		if (typeof payload.ver !== "number") return null
		if (typeof payload.jti !== "string" || !payload.jti) return null
		if (typeof payload.sst !== "number" || !Number.isFinite(payload.sst)) {
			return null
		}
		return {
			id: payload.id,
			typ: payload.typ,
			ver: payload.ver,
			jti: payload.jti,
			sst: payload.sst,
			exp: typeof payload.exp === "number" ? payload.exp : undefined,
		}
	} catch {
		return null
	}
}

export interface MfaChallengeClaims {
	id: string
	purpose: SessionKind
	ver: number
	jti: string
}

const MFA_CHALLENGE_TYPE = "mfa"

export const signMfaChallenge = (
	subject: { id: string; tokenVersion: number },
	purpose: SessionKind,
	lifetimeMs: number
): string =>
	jwt.sign(
		{
			id: subject.id,
			typ: MFA_CHALLENGE_TYPE,
			purpose,
			ver: subject.tokenVersion,
			jti: randomUUID(),
		},
		jwtSecret(),
		{ expiresIn: Math.floor(lifetimeMs / 1000) }
	)

export const verifyMfaChallenge = (
	token: string | undefined
): MfaChallengeClaims | null => {
	if (!token) return null
	try {
		const payload = jwt.verify(token, jwtSecret()) as Record<string, unknown>
		if (payload.typ !== MFA_CHALLENGE_TYPE) return null
		if (typeof payload.id !== "string" || typeof payload.jti !== "string") return null
		if (typeof payload.ver !== "number") return null
		if (payload.purpose !== "user" && payload.purpose !== "admin") return null
		return {
			id: payload.id,
			purpose: payload.purpose,
			ver: payload.ver,
			jti: payload.jti,
		}
	} catch {
		return null
	}
}
