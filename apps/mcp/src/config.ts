const DEFAULT_API_URL = "http://localhost:3001"
const DEFAULT_PORT = 3002
const DEVELOPMENT_RESOURCE = "http://localhost:3002/mcp"
const DEVELOPMENT_CLIENT_SECRET = "sculpt-mcp-development-secret-do-not-deploy"
const DEFAULT_MAX_UPLOAD_MB = 20
const DEFAULT_MAX_IMAGE_MB = 4
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32
const ANY_ORIGIN = "*"
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

export class ConfigurationError extends Error {}

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, "")

const positiveNumber = (raw: string | undefined, fallback: number): number => {
	const value = Number(raw)
	return Number.isFinite(value) && value > 0 ? value : fallback
}

export interface McpConfig {
	production: boolean
	port: number
	apiUrl: string
	issuer: string
	resource: string
	clientId: string
	clientSecret: string
	maxUploadBytes: number
	maxImageBytes: number
	frontendUrl: string
	documentationUrl: string
	allowedOrigins: ReadonlySet<string> | "any"
}

const originOf = (url: string): string | null => {
	try {
		return new URL(url).origin
	} catch {
		return null
	}
}

const allowedOriginsFrom = (
	raw: string | undefined,
	defaults: (string | null)[]
): ReadonlySet<string> | "any" => {
	const listed = (raw ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
	if (listed.includes(ANY_ORIGIN)) return "any"
	return new Set(
		[...defaults, ...listed.map(originOf)].filter((origin): origin is string => !!origin)
	)
}

const isLoopbackOrigin = (origin: string): boolean => {
	try {
		const url = new URL(origin)
		return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)
	} catch {
		return false
	}
}

export const originIsAllowed = (
	config: Pick<McpConfig, "allowedOrigins" | "production">,
	origin: string
): boolean => {
	if (config.allowedOrigins === "any") return true
	if (config.allowedOrigins.has(origin)) return true
	return !config.production && isLoopbackOrigin(origin)
}

export const isProductionEnvironment = (env: NodeJS.ProcessEnv = process.env): boolean =>
	env.NODE_ENV === "production"

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): McpConfig => {
	const production = isProductionEnvironment(env)
	const apiUrl = withoutTrailingSlash(env.SCULPT_API_URL?.trim() || DEFAULT_API_URL)
	const resource = env.MCP_RESOURCE_URL?.trim()
	const clientSecret = env.MCP_CLIENT_SECRET?.trim()
	const frontend = withoutTrailingSlash(env.FRONTEND_URL?.trim() || "http://localhost:3000")

	if (production && !resource) {
		throw new ConfigurationError(
			"MCP_RESOURCE_URL is required in production. Set it to the public URL of this server's /mcp endpoint, exactly as configured on the API."
		)
	}
	if (production && (!clientSecret || clientSecret.length < MINIMUM_PRODUCTION_SECRET_LENGTH)) {
		throw new ConfigurationError(
			`MCP_CLIENT_SECRET must be set to the same value as on the API, at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters long. Generate one with: openssl rand -base64 48`
		)
	}

	return {
		production,
		port: positiveNumber(env.PORT, DEFAULT_PORT),
		apiUrl,
		issuer: withoutTrailingSlash(env.OAUTH_ISSUER?.trim() || apiUrl),
		resource: withoutTrailingSlash(resource || DEVELOPMENT_RESOURCE),
		clientId: env.MCP_CLIENT_ID?.trim() || "sculpt-mcp",
		clientSecret: clientSecret || DEVELOPMENT_CLIENT_SECRET,
		maxUploadBytes: positiveNumber(env.MCP_MAX_UPLOAD_MB, DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024,
		maxImageBytes: positiveNumber(env.MCP_MAX_IMAGE_MB, DEFAULT_MAX_IMAGE_MB) * 1024 * 1024,
		frontendUrl: frontend,
		documentationUrl: `${frontend}/account/integrations`,
		allowedOrigins: allowedOriginsFrom(env.MCP_ALLOWED_ORIGINS, [
			originOf(frontend),
			originOf(resource || DEVELOPMENT_RESOURCE),
		]),
	}
}
