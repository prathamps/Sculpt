import { Scope } from "../scopes.js"
import { AccessTokenVerifier } from "./token-verifier.js"
import { Delegation, TokenRejectedError } from "./delegation.js"

export const PERSONAL_ACCESS_TOKEN_PREFIX = "sculpt_pat_"

export interface Caller {
	userId: string
	scopes: ReadonlySet<Scope>
	clientId: string | null
	via: "oauth" | "personal_access_token"
	apiToken: () => Promise<string>
	forgetApiToken: () => void
}

export interface CallerResolver {
	resolve(token: string): Promise<Caller | null>
}

const exchangeSucceeds = async (delegation: Delegation, token: string): Promise<boolean> => {
	try {
		await delegation.apiTokenFor(token)
		return true
	} catch (error) {
		if (error instanceof TokenRejectedError) return false
		throw error
	}
}

export const createCallerResolver = (
	verifyAccessToken: AccessTokenVerifier,
	delegation: Delegation
): CallerResolver => ({
	async resolve(token) {
		if (token.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX)) {
			const introspection = await delegation.introspectPersonalToken(token)
			if (!introspection) return null
			return {
				userId: introspection.userId,
				scopes: introspection.scopes,
				clientId: null,
				via: "personal_access_token",
				apiToken: async () => token,
				forgetApiToken: () => delegation.forget(token),
			}
		}
		const verified = await verifyAccessToken(token)
		if (!verified || !(await exchangeSucceeds(delegation, token))) return null
		return {
			userId: verified.subject,
			scopes: verified.scopes,
			clientId: verified.clientId,
			via: "oauth",
			apiToken: () => delegation.apiTokenFor(token),
			forgetApiToken: () => delegation.forget(token),
		}
	},
})

const BEARER_PATTERN = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i

export const bearerTokenFrom = (header: string | undefined): string | null =>
	header ? (BEARER_PATTERN.exec(header.trim())?.[1] ?? null) : null
