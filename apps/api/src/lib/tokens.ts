import { randomUUID } from "crypto"
import jwt from "jsonwebtoken"
import { jwtSecret } from "./config"

export type SessionKind = "user" | "admin"

export interface SessionClaims {
	id: string
	typ: SessionKind
	ver: number
	jti: string
}

export interface IssuedToken {
	token: string
	claims: SessionClaims
	expiresAt: Date
}

export const signSessionToken = (
	subject: { id: string; tokenVersion: number },
	kind: SessionKind,
	lifetimeMs: number
): IssuedToken => {
	const claims: SessionClaims = {
		id: subject.id,
		typ: kind,
		ver: subject.tokenVersion,
		jti: randomUUID(),
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
		return { id: payload.id, typ: payload.typ, ver: payload.ver, jti: payload.jti }
	} catch {
		return null
	}
}
