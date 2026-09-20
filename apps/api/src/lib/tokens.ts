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
