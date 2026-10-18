import { JWTPayload, createRemoteJWKSet, jwtVerify } from "jose"
import { McpConfig } from "../config.js"
import { Scope, scopesFrom } from "../scopes.js"

export interface VerifiedAccessToken {
	subject: string
	clientId: string | null
	scopes: Set<Scope>
	expiresAt: number
}

export type AccessTokenVerifier = (token: string) => Promise<VerifiedAccessToken | null>

const ACCESS_TOKEN_TYPE = "at+jwt"
const JWKS_COOLDOWN_MS = 30000

const claimsOf = (payload: JWTPayload): VerifiedAccessToken | null => {
	if (typeof payload.sub !== "string" || !payload.sub) return null
	if (typeof payload.exp !== "number") return null
	return {
		subject: payload.sub,
		clientId: typeof payload.client_id === "string" ? payload.client_id : null,
		scopes: scopesFrom(typeof payload.scope === "string" ? payload.scope : ""),
		expiresAt: payload.exp,
	}
}

export const createAccessTokenVerifier = (config: McpConfig): AccessTokenVerifier => {
	const keys = createRemoteJWKSet(new URL(`${config.apiUrl}/oauth/jwks.json`), {
		cooldownDuration: JWKS_COOLDOWN_MS,
	})
	return async (token) => {
		try {
			const { payload } = await jwtVerify(token, keys, {
				issuer: config.issuer,
				audience: config.resource,
				algorithms: ["ES256"],
				typ: ACCESS_TOKEN_TYPE,
			})
			return claimsOf(payload)
		} catch {
			return null
		}
	}
}
