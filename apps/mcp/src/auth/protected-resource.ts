import { McpConfig } from "../config.js"
import { SCOPES } from "../scopes.js"

const WELL_KNOWN_PATH = "/.well-known/oauth-protected-resource"

export const protectedResourceMetadataPath = (resource: string): string => {
	const { pathname } = new URL(resource)
	return pathname === "/" ? WELL_KNOWN_PATH : `${WELL_KNOWN_PATH}${pathname}`
}

export const protectedResourceMetadataUrl = (resource: string): string =>
	`${new URL(resource).origin}${protectedResourceMetadataPath(resource)}`

export const protectedResourceMetadata = (config: McpConfig) => ({
	resource: config.resource,
	authorization_servers: [config.issuer],
	scopes_supported: [...SCOPES],
	bearer_methods_supported: ["header"],
	resource_signing_alg_values_supported: ["ES256"],
	resource_name: "Sculpt",
	resource_documentation: config.documentationUrl,
})

const quoted = (value: string): string => `"${value.replace(/["\\]/g, "")}"`

export interface ChallengeParameters {
	error?: "invalid_token" | "insufficient_scope" | "invalid_request"
	description?: string
	scope?: string
}

export const bearerChallenge = (config: McpConfig, parameters: ChallengeParameters = {}): string =>
	`Bearer ${[
		`resource_metadata=${quoted(protectedResourceMetadataUrl(config.resource))}`,
		`scope=${quoted(parameters.scope ?? SCOPES.join(" "))}`,
		parameters.error ? `error=${quoted(parameters.error)}` : null,
		parameters.description ? `error_description=${quoted(parameters.description)}` : null,
	]
		.filter(Boolean)
		.join(", ")}`
