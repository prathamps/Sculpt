import { createHash } from "crypto"
import { McpConfig } from "../config.js"
import { logger } from "../logger.js"
import { Scope, scopesFrom } from "../scopes.js"

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange"
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token"
const EXPIRY_SAFETY_MARGIN_MS = 30000
const MAX_DELEGATED_TOKEN_REUSE_MS = 60000
const INTROSPECTION_CACHE_MS = 30000
const MAX_CACHED_ENTRIES = 10000

export class TokenRejectedError extends Error {}
export class AuthorizationServerError extends Error {}

interface CachedValue<V> {
	value: V
	expiresAt: number
}

class ExpiringCache<V> {
	private readonly entries = new Map<string, CachedValue<V>>()

	get(key: string): V | undefined {
		const entry = this.entries.get(key)
		if (!entry) return undefined
		if (entry.expiresAt <= Date.now()) {
			this.entries.delete(key)
			return undefined
		}
		return entry.value
	}

	set(key: string, value: V, expiresAt: number): void {
		this.entries.delete(key)
		this.entries.set(key, { value, expiresAt })
		while (this.entries.size > MAX_CACHED_ENTRIES) {
			const oldest = this.entries.keys().next().value
			if (oldest === undefined) return
			this.entries.delete(oldest)
		}
	}

	delete(key: string): void {
		this.entries.delete(key)
	}

	clear(): void {
		this.entries.clear()
	}
}

const fingerprint = (token: string): string => createHash("sha256").update(token).digest("hex")

const basicAuthorization = (config: McpConfig): string =>
	`Basic ${Buffer.from(
		`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`
	).toString("base64")}`

const postForm = async (config: McpConfig, path: string, form: Record<string, string>) =>
	fetch(`${config.apiUrl}${path}`, {
		method: "POST",
		headers: {
			Authorization: basicAuthorization(config),
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		body: new URLSearchParams(form),
	})

interface ExchangeResponse {
	access_token?: string
	expires_in?: number
	error?: string
	error_description?: string
}

export interface PersonalTokenIntrospection {
	userId: string
	scopes: Set<Scope>
}

export interface Delegation {
	apiTokenFor(subjectToken: string): Promise<string>
	introspectPersonalToken(token: string): Promise<PersonalTokenIntrospection | null>
	forget(token: string): void
	clear(): void
}

export const createDelegation = (config: McpConfig): Delegation => {
	const apiTokens = new ExpiringCache<string>()
	const introspections = new ExpiringCache<PersonalTokenIntrospection | null>()

	const apiTokenFor = async (subjectToken: string): Promise<string> => {
		const key = fingerprint(subjectToken)
		const cached = apiTokens.get(key)
		if (cached) return cached

		const response = await postForm(config, "/oauth/token", {
			grant_type: TOKEN_EXCHANGE_GRANT,
			subject_token: subjectToken,
			subject_token_type: ACCESS_TOKEN_TYPE,
			requested_token_type: ACCESS_TOKEN_TYPE,
		})
		const body = (await response.json().catch(() => ({}))) as ExchangeResponse
		if (response.ok && body.access_token) {
			const lifetimeMs = (body.expires_in ?? 60) * 1000
			const reusableForMs = Math.min(lifetimeMs - EXPIRY_SAFETY_MARGIN_MS, MAX_DELEGATED_TOKEN_REUSE_MS)
			apiTokens.set(key, body.access_token, Date.now() + reusableForMs)
			return body.access_token
		}
		if (body.error === "invalid_grant") {
			throw new TokenRejectedError(body.error_description ?? "The connection was revoked.")
		}
		logger.error("Token exchange failed", undefined, {
			status: response.status,
			oauthError: body.error ?? null,
		})
		throw new AuthorizationServerError(
			body.error === "invalid_client"
				? "The MCP service could not authenticate to Sculpt. Check MCP_CLIENT_SECRET on both services."
				: "Sculpt's authorization server is unavailable."
		)
	}

	const introspectPersonalToken = async (
		token: string
	): Promise<PersonalTokenIntrospection | null> => {
		const key = fingerprint(token)
		const cached = introspections.get(key)
		if (cached !== undefined) return cached

		const response = await postForm(config, "/oauth/introspect", { token })
		if (!response.ok) {
			throw new AuthorizationServerError("Sculpt could not check this access token.")
		}
		const body = (await response.json()) as { active?: boolean; sub?: string; scope?: string }
		const result =
			body.active && typeof body.sub === "string"
				? { userId: body.sub, scopes: scopesFrom(body.scope) }
				: null
		introspections.set(key, result, Date.now() + INTROSPECTION_CACHE_MS)
		return result
	}

	return {
		apiTokenFor,
		introspectPersonalToken,
		forget: (token) => {
			const key = fingerprint(token)
			apiTokens.delete(key)
			introspections.delete(key)
		},
		clear: () => {
			apiTokens.clear()
			introspections.clear()
		},
	}
}
