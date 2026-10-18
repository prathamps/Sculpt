import jwt from "jsonwebtoken"
import { randomUUID } from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { jwtSecret } from "../../lib/config"
import { ValidationError } from "../../lib/errors"
import { AuthenticatedUser } from "../../types"
import {
	AUTHORIZATION_CODE_GRANT,
	isRegisteredRedirect,
} from "./client-metadata"
import { ResolvedClient, findClient } from "./clients.service"
import {
	apiResource,
	authorizationCodeLifetimeMs,
	authorizationRequestLifetimeMs,
	frontendOrigin,
	mcpResource,
	oauthIssuer,
	resolveResource,
} from "./oauth.config"
import { PKCE_METHOD, isWellFormedPkceValue } from "./pkce"
import {
	EVERYDAY_SCOPES,
	SCOPES,
	SCOPE_DESCRIPTIONS,
	Scope,
	narrowScopes,
	parseScopeString,
} from "./scopes"
import { describeClientIdentity } from "./client-identity"
import { coversScopes, findActiveGrant, hostOfRedirect, recordConsent } from "./grants.service"
import { generateSecret, hashSecret } from "./secrets"

const AUTHORIZATION_REQUEST_TYPE = "oauth_authorization_request"
const AUTHORIZATION_CODE_PREFIX = "sculpt_code_"
const MAX_STATE_LENGTH = 2000
const IGNORED_STANDARD_SCOPES = new Set(["openid", "profile", "email", "offline_access"])
const UNIQUE_VIOLATION = "P2002"

export interface AuthorizationRequest {
	requestId: string
	expiresAt: Date
	clientId: string
	redirectUri: string
	codeChallenge: string
	scopes: Scope[]
	state: string | null
	resource: string
}

export type AuthorizationOutcome =
	| { kind: "consent"; location: string }
	| { kind: "redirect_error"; location: string }
	| { kind: "fatal"; location: string }

type QueryValue = string | string[] | undefined

const single = (value: unknown): string | undefined => {
	if (typeof value === "string") return value
	return undefined
}

const consentPageUrl = (parameters: Record<string, string>): string => {
	const url = new URL(`${frontendOrigin()}/consent`)
	Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value))
	return url.toString()
}

const fatal = (reason: string): AuthorizationOutcome => ({
	kind: "fatal",
	location: consentPageUrl({ error: reason }),
})

export const redirectWithParameters = (
	redirectUri: string,
	parameters: Record<string, string | null | undefined>
): string => {
	const url = new URL(redirectUri)
	Object.entries(parameters).forEach(([key, value]) => {
		if (value !== null && value !== undefined) url.searchParams.set(key, value)
	})
	return url.toString()
}

const redirectError = (
	redirectUri: string,
	state: string | null,
	error: string,
	description: string
): AuthorizationOutcome => ({
	kind: "redirect_error",
	location: redirectWithParameters(redirectUri, {
		error,
		error_description: description,
		state,
		iss: oauthIssuer(),
	}),
})

const chosenRedirectUri = (client: ResolvedClient, presented: string | undefined): string | null => {
	if (presented) return isRegisteredRedirect(client.redirectUris, presented) ? presented : null
	return client.redirectUris.length === 1 ? (client.redirectUris[0] ?? null) : null
}

export const requestedScopes = (
	raw: string | undefined,
	client: Pick<ResolvedClient, "scope">
): { scopes: Scope[]; unknown: string[] } => {
	const parsed = parseScopeString(raw)
	const unknown = parsed.unknown.filter((scope) => !IGNORED_STANDARD_SCOPES.has(scope))
	const registered = client.scope ? parseScopeString(client.scope).scopes : [...SCOPES]
	const wanted = parsed.scopes.length ? parsed.scopes : EVERYDAY_SCOPES
	return { scopes: narrowScopes(registered, wanted), unknown }
}

type UnsignedRequest = Omit<AuthorizationRequest, "requestId" | "expiresAt">

const signAuthorizationRequest = (request: UnsignedRequest): string =>
	jwt.sign({ typ: AUTHORIZATION_REQUEST_TYPE, ...request }, jwtSecret(), {
		expiresIn: Math.floor(authorizationRequestLifetimeMs() / 1000),
		jwtid: randomUUID(),
	})

export const readAuthorizationRequest = (token: unknown): AuthorizationRequest => {
	const expired = new ValidationError(
		"This sign-in request has expired or is invalid. Start again from the app you are connecting."
	)
	if (typeof token !== "string" || !token) throw expired
	try {
		const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] }) as Record<
			string,
			unknown
		>
		if (payload.typ !== AUTHORIZATION_REQUEST_TYPE) throw expired
		if (typeof payload.jti !== "string" || typeof payload.exp !== "number") throw expired
		return {
			requestId: payload.jti,
			expiresAt: new Date(payload.exp * 1000),
			clientId: String(payload.clientId),
			redirectUri: String(payload.redirectUri),
			codeChallenge: String(payload.codeChallenge),
			scopes: parseScopeString((payload.scopes as string[]).join(" ")).scopes,
			state: typeof payload.state === "string" ? payload.state : null,
			resource: String(payload.resource),
		}
	} catch {
		throw expired
	}
}

export const beginAuthorization = async (
	query: Record<string, QueryValue>
): Promise<AuthorizationOutcome> => {
	const clientId = single(query.client_id)
	if (!clientId) return fatal("missing_client")

	const client = await findClient(clientId)
	if (!client || client.disabled) return fatal("unknown_client")

	const redirectUri = chosenRedirectUri(client, single(query.redirect_uri))
	if (!redirectUri) return fatal("redirect_uri_mismatch")

	const state = single(query.state) ?? null
	if (state && state.length > MAX_STATE_LENGTH) {
		return redirectError(redirectUri, null, "invalid_request", "state is too long.")
	}
	const fail = (error: string, description: string) =>
		redirectError(redirectUri, state, error, description)

	if (single(query.response_type) !== "code") {
		return fail("unsupported_response_type", 'response_type must be "code".')
	}
	if (!client.grantTypes.includes(AUTHORIZATION_CODE_GRANT)) {
		return fail("unauthorized_client", "This client may not use the authorization code flow.")
	}
	const codeChallenge = single(query.code_challenge)
	if (!isWellFormedPkceValue(codeChallenge)) {
		return fail("invalid_request", "A PKCE code_challenge is required.")
	}
	if (single(query.code_challenge_method) !== PKCE_METHOD) {
		return fail("invalid_request", `code_challenge_method must be ${PKCE_METHOD}.`)
	}

	const { scopes, unknown } = requestedScopes(single(query.scope), client)
	if (unknown.length) return fail("invalid_scope", `Unknown scope: ${unknown.join(" ")}.`)
	if (scopes.length === 0) return fail("invalid_scope", "No grantable scopes were requested.")

	if (Array.isArray(query.resource)) {
		return fail("invalid_target", "Request a single resource per authorization.")
	}
	const resource = resolveResource(single(query.resource))
	if (!resource) return fail("invalid_target", "The requested resource is not served by Sculpt.")

	const handle = signAuthorizationRequest({
		clientId: client.id,
		redirectUri,
		codeChallenge,
		scopes,
		state,
		resource,
	})
	return { kind: "consent", location: consentPageUrl({ request: handle }) }
}

const usableClientFor = async (request: AuthorizationRequest): Promise<ResolvedClient> => {
	const client = await findClient(request.clientId)
	if (!client || client.disabled || !isRegisteredRedirect(client.redirectUris, request.redirectUri)) {
		throw new ValidationError("This app is no longer allowed to connect to Sculpt.")
	}
	return client
}

export const describeResource = (resource: string) => ({
	url: resource,
	kind: resource === mcpResource() ? "mcp" : resource === apiResource() ? "api" : "other",
})

const alreadyDecided = new ValidationError(
	"This sign-in request was already used. Start again from the app you are connecting."
)

const assertNotDecided = async (request: AuthorizationRequest): Promise<void> => {
	const consumed = await prisma.oAuthConsumedRequest.findUnique({
		where: { id: request.requestId },
		select: { id: true },
	})
	if (consumed) throw alreadyDecided
}

const markDecided = async (request: AuthorizationRequest): Promise<void> => {
	try {
		await prisma.oAuthConsumedRequest.create({
			data: { id: request.requestId, expiresAt: request.expiresAt },
		})
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
			throw alreadyDecided
		}
		throw error
	}
}

interface RememberedGrant {
	scopes: string[]
	requestedScopes: string[]
	tokenVersion: number
}

export const rememberedScopesFor = (
	existing: RememberedGrant | null,
	request: Pick<AuthorizationRequest, "scopes">,
	user: Pick<AuthenticatedUser, "tokenVersion">
): Scope[] | null => {
	if (!existing || existing.tokenVersion !== user.tokenVersion) return null
	const decidedBefore = [...existing.scopes, ...existing.requestedScopes]
	if (!coversScopes(decidedBefore, request.scopes)) return null
	const remembered = narrowScopes(request.scopes, existing.scopes)
	return remembered.length ? remembered : null
}

export const describeConsent = async (token: unknown, user: AuthenticatedUser) => {
	const request = readAuthorizationRequest(token)
	await assertNotDecided(request)
	const client = await usableClientFor(request)
	const existing = await findActiveGrant(user.id, client.id, request.resource)
	const remembered = rememberedScopesFor(existing, request, user)
	const redirectHost = hostOfRedirect(request.redirectUri)
	return {
		client: {
			id: client.id,
			name: client.name,
			kind: client.kind,
			clientUri: client.clientUri,
			logoUri: client.logoUri,
			verified: client.verified,
		},
		identity: describeClientIdentity(client, request.redirectUri, redirectHost),
		redirectHost,
		resource: describeResource(request.resource),
		scopes: request.scopes.map((scope) => SCOPE_DESCRIPTIONS[scope]),
		recommendedScopes: narrowScopes(request.scopes, EVERYDAY_SCOPES),
		previouslyGranted: existing?.scopes ?? [],
		rememberedScopes: remembered ?? [],
		autoApprove: remembered !== null,
	}
}

export interface ConsentDecision {
	approved: boolean
	scopes?: string[]
}

export interface ConsentResult {
	redirectTo: string
	clientId: string
	scopes: Scope[]
	resource: string
	approved: boolean
}

export const decideConsent = async (
	token: unknown,
	user: AuthenticatedUser,
	decision: ConsentDecision
): Promise<ConsentResult> => {
	const request = readAuthorizationRequest(token)
	const client = await usableClientFor(request)
	const declined = (): ConsentResult => ({
		redirectTo: redirectWithParameters(request.redirectUri, {
			error: "access_denied",
			error_description: "The person declined to connect this app.",
			state: request.state,
			iss: oauthIssuer(),
		}),
		clientId: client.id,
		scopes: [],
		resource: request.resource,
		approved: false,
	})
	if (!decision.approved) {
		await markDecided(request)
		return declined()
	}

	const scopes = decision.scopes
		? narrowScopes(request.scopes, decision.scopes)
		: request.scopes
	if (scopes.length === 0) {
		throw new ValidationError("Allow at least one permission, or choose Deny.")
	}
	await markDecided(request)

	const grant = await recordConsent({
		userId: user.id,
		clientId: client.id,
		resource: request.resource,
		scopes,
		requestedScopes: request.scopes,
		tokenVersion: user.tokenVersion,
	})
	const code = generateSecret(AUTHORIZATION_CODE_PREFIX)
	await prisma.oAuthAuthorizationCode.create({
		data: {
			codeHash: hashSecret(code),
			grantId: grant.id,
			redirectUri: request.redirectUri,
			codeChallenge: request.codeChallenge,
			scopes,
			resource: request.resource,
			expiresAt: new Date(Date.now() + authorizationCodeLifetimeMs()),
		},
	})
	return {
		redirectTo: redirectWithParameters(request.redirectUri, {
			code,
			state: request.state,
			iss: oauthIssuer(),
		}),
		clientId: client.id,
		scopes,
		resource: request.resource,
		approved: true,
	}
}
