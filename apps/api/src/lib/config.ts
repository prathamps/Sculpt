const PLACEHOLDER_JWT_SECRET = "your_jwt_secret"
const DEVELOPMENT_JWT_SECRET = "sculpt-development-secret-do-not-deploy"
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32

export const isProduction = (): boolean => process.env.NODE_ENV === "production"

export class ConfigurationError extends Error {}

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

export const assertStartupConfiguration = (): void => {
	jwtSecret()

	if (isProduction() && !process.env.FRONTEND_URL) {
		throw new ConfigurationError(
			"FRONTEND_URL is required when NODE_ENV=production so browser origins can be allowlisted."
		)
	}
}
