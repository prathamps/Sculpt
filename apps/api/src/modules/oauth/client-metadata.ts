import { z } from "zod"
import { OAuthError } from "./oauth-errors"
import { formatScopes, parseScopeString } from "./scopes"

export const AUTHORIZATION_CODE_GRANT = "authorization_code"
export const REFRESH_TOKEN_GRANT = "refresh_token"
export const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange"

export const REGISTRABLE_GRANT_TYPES = [AUTHORIZATION_CODE_GRANT, REFRESH_TOKEN_GRANT]
export const REGISTRABLE_AUTH_METHODS = ["none", "client_secret_basic", "client_secret_post"]
export const PUBLIC_CLIENT_AUTH_METHOD = "none"

const MAX_REDIRECT_URIS = 10
const MAX_URI_LENGTH = 2000
const MAX_CLIENT_NAME_LENGTH = 120
const MAX_SOFTWARE_FIELD_LENGTH = 200
const FALLBACK_CLIENT_NAME = "Unnamed app"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
const UNSAFE_SCHEMES = new Set([
	"javascript:",
	"data:",
	"file:",
	"vbscript:",
	"about:",
	"blob:",
	"filesystem:",
	"ws:",
	"wss:",
	"ftp:",
	"mailto:",
	"tel:",
])
const PRIVATE_USE_SCHEME = /^[a-z][a-z0-9+.-]*:$/

const parsedUrl = (value: string): URL | null => {
	try {
		return new URL(value)
	} catch {
		return null
	}
}

export const isLoopbackHttpUrl = (url: URL): boolean =>
	url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname.toLowerCase())

export const redirectUriProblem = (uri: string): string | null => {
	if (uri.length > MAX_URI_LENGTH) return "is too long"
	const url = parsedUrl(uri)
	if (!url) return "is not an absolute URL"
	if (url.hash || uri.includes("#")) return "must not contain a fragment"
	if (url.username || url.password) return "must not contain credentials"
	const scheme = url.protocol.toLowerCase()
	if (UNSAFE_SCHEMES.has(scheme)) return `uses the unsafe ${scheme} scheme`
	if (scheme === "https:") return url.hostname ? null : "must include a host"
	if (scheme === "http:") {
		return isLoopbackHttpUrl(url)
			? null
			: "may use http only for localhost, 127.0.0.1 or [::1]"
	}
	return PRIVATE_USE_SCHEME.test(scheme) ? null : "uses an unrecognised scheme"
}

const sameExceptPort = (left: URL, right: URL): boolean =>
	left.protocol === right.protocol &&
	left.hostname.toLowerCase() === right.hostname.toLowerCase() &&
	left.pathname === right.pathname &&
	left.search === right.search

export const redirectMatches = (registered: string, presented: string): boolean => {
	if (registered === presented) return true
	const registeredUrl = parsedUrl(registered)
	const presentedUrl = parsedUrl(presented)
	if (!registeredUrl || !presentedUrl) return false
	return (
		isLoopbackHttpUrl(registeredUrl) &&
		isLoopbackHttpUrl(presentedUrl) &&
		sameExceptPort(registeredUrl, presentedUrl)
	)
}

export const isRegisteredRedirect = (registered: readonly string[], presented: string): boolean =>
	registered.some((uri) => redirectMatches(uri, presented))

const webUrlProblem = (value: string): string | null => {
	const url = parsedUrl(value)
	if (!url) return "is not an absolute URL"
	if (url.protocol === "https:" || isLoopbackHttpUrl(url)) return null
	return "must be an https URL"
}

const withoutControlCharacters = (value: string): string =>
	Array.from(value)
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0
			return code >= 0x20 && code !== 0x7f
		})
		.join("")
		.trim()

export const displayName = (value: string | null | undefined): string => {
	const cleaned = withoutControlCharacters(value ?? "").slice(0, MAX_CLIENT_NAME_LENGTH)
	return cleaned || FALLBACK_CLIENT_NAME
}

const optionalText = z.string().max(MAX_URI_LENGTH).nullish()

const registrationSchema = z.object({
	redirect_uris: z.array(z.string()).min(1).max(MAX_REDIRECT_URIS),
	client_name: z.string().max(MAX_URI_LENGTH).nullish(),
	client_uri: optionalText,
	logo_uri: optionalText,
	grant_types: z.array(z.string()).max(10).nullish(),
	response_types: z.array(z.string()).max(10).nullish(),
	token_endpoint_auth_method: z.string().max(100).nullish(),
	scope: z.string().max(MAX_URI_LENGTH).nullish(),
	software_id: z.string().max(MAX_SOFTWARE_FIELD_LENGTH).nullish(),
	software_version: z.string().max(MAX_SOFTWARE_FIELD_LENGTH).nullish(),
})

export interface ClientRegistration {
	name: string
	redirectUris: string[]
	grantTypes: string[]
	tokenEndpointAuthMethod: string
	scope: string | null
	clientUri: string | null
	logoUri: string | null
	softwareId: string | null
	softwareVersion: string | null
}

const invalidMetadata = (description: string): OAuthError =>
	new OAuthError("invalid_client_metadata", description)

const checkedWebUrl = (field: string, value: string | null | undefined): string | null => {
	if (!value) return null
	const problem = webUrlProblem(value)
	if (problem) throw invalidMetadata(`${field} ${problem}.`)
	return value
}

const checkedGrantTypes = (requested: string[] | null | undefined): string[] => {
	const grantTypes = requested?.length ? Array.from(new Set(requested)) : REGISTRABLE_GRANT_TYPES
	const unsupported = grantTypes.filter((grant) => !REGISTRABLE_GRANT_TYPES.includes(grant))
	if (unsupported.length) {
		throw invalidMetadata(`grant_types ${unsupported.join(", ")} are not supported.`)
	}
	if (!grantTypes.includes(AUTHORIZATION_CODE_GRANT)) {
		throw invalidMetadata("grant_types must include authorization_code.")
	}
	return grantTypes
}

const checkedResponseTypes = (requested: string[] | null | undefined): void => {
	if (!requested?.length) return
	if (requested.some((type) => type !== "code")) {
		throw invalidMetadata('Only the "code" response type is supported.')
	}
}

const checkedAuthMethod = (requested: string | null | undefined): string => {
	const method = requested || PUBLIC_CLIENT_AUTH_METHOD
	if (!REGISTRABLE_AUTH_METHODS.includes(method)) {
		throw invalidMetadata(
			`token_endpoint_auth_method must be one of ${REGISTRABLE_AUTH_METHODS.join(", ")}.`
		)
	}
	return method
}

const checkedRedirectUris = (uris: string[]): string[] => {
	for (const uri of uris) {
		const problem = redirectUriProblem(uri)
		if (problem) {
			throw new OAuthError("invalid_redirect_uri", `Redirect URI ${uri} ${problem}.`)
		}
	}
	return Array.from(new Set(uris))
}

export const parseClientRegistration = (body: unknown): ClientRegistration => {
	const parsed = registrationSchema.safeParse(body ?? {})
	if (!parsed.success) {
		const issue = parsed.error.issues[0]
		const field = issue?.path.join(".") || "metadata"
		throw invalidMetadata(`${field}: ${issue?.message ?? "is invalid"}`)
	}
	const metadata = parsed.data
	checkedResponseTypes(metadata.response_types)
	const scope = metadata.scope ? formatScopes(parseScopeString(metadata.scope).scopes) : ""
	return {
		name: displayName(metadata.client_name),
		redirectUris: checkedRedirectUris(metadata.redirect_uris),
		grantTypes: checkedGrantTypes(metadata.grant_types),
		tokenEndpointAuthMethod: checkedAuthMethod(metadata.token_endpoint_auth_method),
		scope: scope || null,
		clientUri: checkedWebUrl("client_uri", metadata.client_uri),
		logoUri: checkedWebUrl("logo_uri", metadata.logo_uri),
		softwareId: metadata.software_id ?? null,
		softwareVersion: metadata.software_version ?? null,
	}
}
