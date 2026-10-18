import { isProduction } from "../../lib/config"

const DEFAULT_API_URL = "http://localhost:3001"
const DEFAULT_FRONTEND_URL = "http://localhost:3000"
const DEVELOPMENT_MCP_RESOURCE = "http://localhost:3002/mcp"
const DEVELOPMENT_MCP_CLIENT_SECRET = "sculpt-mcp-development-secret-do-not-deploy"
const MINIMUM_PRODUCTION_CLIENT_SECRET_LENGTH = 32

const MINUTE_MS = 60000
const DAY_MS = 24 * 3600000

const DEFAULT_ACCESS_TOKEN_MINUTES = 60
const DEFAULT_REFRESH_TOKEN_DAYS = 30
const DELEGATED_TOKEN_MINUTES = 5
const AUTHORIZATION_CODE_MINUTES = 5
const AUTHORIZATION_REQUEST_MINUTES = 15
const DEFAULT_KEY_ROTATION_DAYS = 90

export const MCP_SERVICE_CLIENT_ID = "sculpt-mcp"

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, "")

const positiveNumberFromEnv = (variable: string, fallback: number): number => {
	const configured = Number(process.env[variable])
	return Number.isFinite(configured) && configured > 0 ? configured : fallback
}

export const oauthIssuer = (): string =>
	withoutTrailingSlash(
		process.env.OAUTH_ISSUER?.trim() || process.env.API_URL?.trim() || DEFAULT_API_URL
	)

export const frontendOrigin = (): string =>
	withoutTrailingSlash(
		process.env.FRONTEND_URL?.trim() ||
			process.env.NEXT_PUBLIC_APP_URL?.trim() ||
			DEFAULT_FRONTEND_URL
	)

export const apiResource = (): string =>
	withoutTrailingSlash(
		process.env.OAUTH_API_RESOURCE?.trim() ||
			process.env.API_URL?.trim() ||
			DEFAULT_API_URL
	)

export const mcpResource = (): string | null => {
	const configured = process.env.MCP_RESOURCE_URL?.trim()
	if (configured) return withoutTrailingSlash(configured)
	return isProduction() ? null : DEVELOPMENT_MCP_RESOURCE
}

export const mcpServiceClientSecret = (): string | null => {
	const configured = process.env.MCP_CLIENT_SECRET?.trim()
	if (configured) return configured
	return isProduction() ? null : DEVELOPMENT_MCP_CLIENT_SECRET
}

export const mcpServiceSecretProblem = (): string | null => {
	const secret = process.env.MCP_CLIENT_SECRET?.trim()
	if (!isProduction() || !mcpResource()) return null
	if (!secret) {
		return "MCP_RESOURCE_URL is set but MCP_CLIENT_SECRET is not, so the MCP service cannot act on anyone's behalf. Generate one with: openssl rand -base64 48"
	}
	if (secret.length < MINIMUM_PRODUCTION_CLIENT_SECRET_LENGTH) {
		return `MCP_CLIENT_SECRET must be at least ${MINIMUM_PRODUCTION_CLIENT_SECRET_LENGTH} characters when NODE_ENV=production.`
	}
	return null
}

export const dynamicRegistrationEnabled = (): boolean =>
	process.env.OAUTH_DYNAMIC_REGISTRATION?.trim().toLowerCase() !== "false"

export const metadataDocumentClientsEnabled = (): boolean =>
	process.env.OAUTH_CLIENT_METADATA_DOCUMENTS?.trim().toLowerCase() !== "false"

export const accessTokenLifetimeMs = (): number =>
	positiveNumberFromEnv("OAUTH_ACCESS_TOKEN_TTL_MINUTES", DEFAULT_ACCESS_TOKEN_MINUTES) *
	MINUTE_MS

export const refreshTokenLifetimeMs = (): number =>
	positiveNumberFromEnv("OAUTH_REFRESH_TOKEN_TTL_DAYS", DEFAULT_REFRESH_TOKEN_DAYS) * DAY_MS

export const delegatedTokenLifetimeMs = (): number => DELEGATED_TOKEN_MINUTES * MINUTE_MS

export const authorizationCodeLifetimeMs = (): number =>
	AUTHORIZATION_CODE_MINUTES * MINUTE_MS

export const authorizationRequestLifetimeMs = (): number =>
	AUTHORIZATION_REQUEST_MINUTES * MINUTE_MS

export const signingKeyRotationMs = (): number =>
	positiveNumberFromEnv("OAUTH_KEY_ROTATION_DAYS", DEFAULT_KEY_ROTATION_DAYS) * DAY_MS

export const retiredKeyPublicationMs = (): number =>
	Math.max(accessTokenLifetimeMs(), delegatedTokenLifetimeMs()) * 2

export const allowedResources = (): string[] =>
	[apiResource(), mcpResource()].filter((resource): resource is string => !!resource)

const normalizedResource = (value: string): string | null => {
	try {
		const url = new URL(value)
		if (url.hash) return null
		url.search = ""
		return withoutTrailingSlash(url.toString())
	} catch {
		return null
	}
}

const resourcesByPreference = (): string[] =>
	[mcpResource(), apiResource()].filter((resource): resource is string => !!resource)

export const resolveResource = (requested: string | null | undefined): string | null => {
	if (!requested) return mcpResource() ?? apiResource()
	const wanted = normalizedResource(requested)
	if (!wanted) return null
	const candidates = resourcesByPreference()
	const exact = candidates.find((resource) => normalizedResource(resource) === wanted)
	if (exact) return exact
	return (
		candidates.find((resource) =>
			(normalizedResource(resource) ?? "").startsWith(`${wanted}/`)
		) ?? null
	)
}
