const PLACEHOLDER_JWT_SECRET = "your_jwt_secret"
const DEVELOPMENT_JWT_SECRET = "sculpt-development-secret-do-not-deploy"
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32

export const isProduction = (): boolean => process.env.NODE_ENV === "production"

export class ConfigurationError extends Error {}

export const servesOverHttps = (): boolean => {
	const frontend = process.env.FRONTEND_URL?.trim().toLowerCase()
	if (!frontend) return isProduction()
	return frontend.startsWith("https://")
}

export const usesSecureCookies = (): boolean =>
	isProduction() && servesOverHttps()

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

const frontendIsLoopback = (): boolean => {
	try {
		return LOOPBACK_HOSTS.has(new URL(process.env.FRONTEND_URL ?? "").hostname)
	} catch {
		return false
	}
}

export const insecureHttpAllowed = (): boolean =>
	process.env.ALLOW_INSECURE_HTTP?.trim().toLowerCase() === "true"

export const jwtSecret = (): string => {
	const configured = process.env.JWT_SECRET?.trim()

	if (!isProduction()) return configured || DEVELOPMENT_JWT_SECRET

	if (!configured) {
		throw new ConfigurationError(
			"JWT_SECRET is required when NODE_ENV=production. Generate one with: openssl rand -base64 48"
		)
	}
	if (configured === PLACEHOLDER_JWT_SECRET) {
		throw new ConfigurationError(
			"JWT_SECRET is still the placeholder value from .env.example. Anyone can forge sessions with it. Generate one with: openssl rand -base64 48"
		)
	}
	if (configured.length < MINIMUM_PRODUCTION_SECRET_LENGTH) {
		throw new ConfigurationError(
			`JWT_SECRET must be at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters when NODE_ENV=production (got ${configured.length}).`
		)
	}
	return configured
}

export const startupWarnings = (): string[] => {
	const warnings: string[] = []
	if (isProduction() && process.env.FRONTEND_URL && !servesOverHttps()) {
		warnings.push(
			"FRONTEND_URL is plain HTTP, so session cookies are sent without the Secure flag and anyone on the network can read them. Serve Sculpt over HTTPS (see the tls profile in docker-compose.selfhost.yml)."
		)
	}
	if (isProduction() && !process.env.MFA_ENCRYPTION_KEY?.trim()) {
		warnings.push(
			"MFA_ENCRYPTION_KEY is not set, so two-factor secrets are encrypted with a key derived from JWT_SECRET. Rotating JWT_SECRET would then disable everyone's two-factor setup. Generate one with: openssl rand -base64 32"
		)
	}
	return warnings
}

export const assertStartupConfiguration = (): void => {
	jwtSecret()

	if (
		isProduction() &&
		process.env.FRONTEND_URL &&
		!servesOverHttps() &&
		!frontendIsLoopback() &&
		!insecureHttpAllowed()
	) {
		throw new ConfigurationError(
			"FRONTEND_URL is plain HTTP on a network address. Serve Sculpt over HTTPS, or set ALLOW_INSECURE_HTTP=true to accept that sessions travel unencrypted."
		)
	}

	if (isProduction() && !process.env.FRONTEND_URL) {
		throw new ConfigurationError(
			"FRONTEND_URL is required when NODE_ENV=production so browser origins can be allowlisted."
		)
	}
}
