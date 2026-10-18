import { randomUUID } from "crypto"
import jwt from "jsonwebtoken"
import { oauthIssuer } from "./oauth.config"
import { Scope, formatScopes, parseScopeString } from "./scopes"
import {
	SIGNING_ALGORITHM,
	activeSigningKey,
	verificationKey,
} from "./signing-keys.service"

export const ACCESS_TOKEN_TYPE = "at+jwt"

export interface AccessTokenActor {
	sub: string
}

export interface AccessTokenClaims {
	iss: string
	sub: string
	aud: string
	client_id: string
	scope: string
	jti: string
	iat: number
	exp: number
	ver: number
	gid: string
	act?: AccessTokenActor
}

export interface AccessTokenSubject {
	userId: string
	tokenVersion: number
	grantId: string
	clientId: string
	scopes: readonly Scope[]
	resource: string
	lifetimeMs: number
	actor?: AccessTokenActor
	notAfter?: number
}

export interface IssuedAccessToken {
	token: string
	claims: AccessTokenClaims
	expiresInSeconds: number
}

const nowInSeconds = (): number => Math.floor(Date.now() / 1000)

export const signAccessToken = async (
	subject: AccessTokenSubject
): Promise<IssuedAccessToken> => {
	const key = await activeSigningKey()
	const issuedAt = nowInSeconds()
	const naturalExpiry = issuedAt + Math.floor(subject.lifetimeMs / 1000)
	const expiresAt = subject.notAfter
		? Math.min(naturalExpiry, subject.notAfter)
		: naturalExpiry
	const claims: AccessTokenClaims = {
		iss: oauthIssuer(),
		sub: subject.userId,
		aud: subject.resource,
		client_id: subject.clientId,
		scope: formatScopes(subject.scopes),
		jti: randomUUID(),
		iat: issuedAt,
		exp: expiresAt,
		ver: subject.tokenVersion,
		gid: subject.grantId,
		...(subject.actor ? { act: subject.actor } : {}),
	}
	const token = jwt.sign(claims, key.privateKey, {
		algorithm: SIGNING_ALGORITHM,
		keyid: key.kid,
		header: { alg: SIGNING_ALGORITHM, typ: ACCESS_TOKEN_TYPE, kid: key.kid },
	})
	return { token, claims, expiresInSeconds: Math.max(0, expiresAt - issuedAt) }
}

const headerOf = (token: string): { kid?: string; typ?: string } | null => {
	const decoded = jwt.decode(token, { complete: true })
	if (!decoded || typeof decoded === "string") return null
	return decoded.header as { kid?: string; typ?: string }
}

const isWellFormedClaims = (payload: unknown): payload is AccessTokenClaims => {
	if (!payload || typeof payload !== "object") return false
	const claims = payload as Record<string, unknown>
	return (
		typeof claims.sub === "string" &&
		claims.sub.length > 0 &&
		typeof claims.client_id === "string" &&
		typeof claims.scope === "string" &&
		typeof claims.jti === "string" &&
		typeof claims.ver === "number" &&
		typeof claims.gid === "string" &&
		typeof claims.exp === "number" &&
		typeof claims.aud === "string"
	)
}

export const looksLikeJwt = (token: string): boolean => token.split(".").length === 3

export const verifyAccessToken = async (
	token: string,
	expectedAudience: string
): Promise<AccessTokenClaims | null> => {
	if (!looksLikeJwt(token)) return null
	const header = headerOf(token)
	if (!header?.kid || header.typ?.toLowerCase() !== ACCESS_TOKEN_TYPE) return null
	const key = await verificationKey(header.kid)
	if (!key) return null
	try {
		const payload = jwt.verify(token, key, {
			algorithms: [SIGNING_ALGORITHM],
			issuer: oauthIssuer(),
			audience: expectedAudience,
		})
		return isWellFormedClaims(payload) ? payload : null
	} catch {
		return null
	}
}

export const scopesOfClaims = (claims: Pick<AccessTokenClaims, "scope">): Scope[] =>
	parseScopeString(claims.scope).scopes
