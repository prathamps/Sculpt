import {
	AUTHORIZATION_CODE_GRANT,
	REFRESH_TOKEN_GRANT,
	REGISTRABLE_AUTH_METHODS,
	TOKEN_EXCHANGE_GRANT,
} from "./client-metadata"
import {
	apiResource,
	dynamicRegistrationEnabled,
	frontendOrigin,
	metadataDocumentClientsEnabled,
	oauthIssuer,
} from "./oauth.config"
import { PKCE_METHOD } from "./pkce"
import { SCOPES } from "./scopes"
import { SIGNING_ALGORITHM } from "./signing-keys.service"

export const OAUTH_PATHS = {
	authorize: "/oauth/authorize",
	token: "/oauth/token",
	register: "/oauth/register",
	revoke: "/oauth/revoke",
	introspect: "/oauth/introspect",
	jwks: "/oauth/jwks.json",
} as const

const endpoint = (path: string): string => `${oauthIssuer()}${path}`

const CLIENT_AUTH_METHODS = Array.from(new Set([...REGISTRABLE_AUTH_METHODS]))

export const authorizationServerMetadata = () => ({
	issuer: oauthIssuer(),
	authorization_endpoint: endpoint(OAUTH_PATHS.authorize),
	token_endpoint: endpoint(OAUTH_PATHS.token),
	jwks_uri: endpoint(OAUTH_PATHS.jwks),
	revocation_endpoint: endpoint(OAUTH_PATHS.revoke),
	introspection_endpoint: endpoint(OAUTH_PATHS.introspect),
	...(dynamicRegistrationEnabled()
		? { registration_endpoint: endpoint(OAUTH_PATHS.register) }
		: {}),
	scopes_supported: [...SCOPES],
	response_types_supported: ["code"],
	response_modes_supported: ["query"],
	grant_types_supported: [AUTHORIZATION_CODE_GRANT, REFRESH_TOKEN_GRANT, TOKEN_EXCHANGE_GRANT],
	token_endpoint_auth_methods_supported: CLIENT_AUTH_METHODS,
	revocation_endpoint_auth_methods_supported: CLIENT_AUTH_METHODS,
	introspection_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
	code_challenge_methods_supported: [PKCE_METHOD],
	authorization_response_iss_parameter_supported: true,
	client_id_metadata_document_supported: metadataDocumentClientsEnabled(),
	resource_indicators_supported: true,
	service_documentation: `${frontendOrigin()}/account/integrations`,
	op_policy_uri: `${frontendOrigin()}/account/integrations`,
})

export const apiProtectedResourceMetadata = () => ({
	resource: apiResource(),
	authorization_servers: [oauthIssuer()],
	scopes_supported: [...SCOPES],
	bearer_methods_supported: ["header"],
	resource_signing_alg_values_supported: [SIGNING_ALGORITHM],
	resource_name: "Sculpt API",
	resource_documentation: `${frontendOrigin()}/account/integrations`,
})
