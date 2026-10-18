import { prisma } from "../../lib/prisma"
import { recordAudit } from "../audit/audit.service"
import {
	AUTHORIZATION_CODE_GRANT,
	REFRESH_TOKEN_GRANT,
	TOKEN_EXCHANGE_GRANT,
} from "./client-metadata"
import { ResolvedClient, noteClientUsed } from "./clients.service"
import {
	MCP_SERVICE_CLIENT_ID,
	accessTokenLifetimeMs,
	apiResource,
	delegatedTokenLifetimeMs,
	mcpResource,
	oauthIssuer,
	refreshTokenLifetimeMs,
	resolveResource,
} from "./oauth.config"
import { OAuthError } from "./oauth-errors"
import { verifierMatchesChallenge } from "./pkce"
import {
	AccessTokenClaims,
	scopesOfClaims,
	signAccessToken,
	verifyAccessToken,
} from "./access-tokens"
import { LiveGrant, liveGrant, noteGrantUsed, revokeGrant } from "./grants.service"
import { Scope, formatScopes, narrowScopes, onlyKnownScopes, parseScopeString } from "./scopes"
import { generateSecret, hashSecret } from "./secrets"
import { verifyPersonalAccessToken } from "./personal-tokens.service"

export const ACCESS_TOKEN_TYPE_URN = "urn:ietf:params:oauth:token-type:access_token"
const JWT_TOKEN_TYPE_URN = "urn:ietf:params:oauth:token-type:jwt"
const REFRESH_TOKEN_PREFIX = "sculpt_rt_"

export interface TokenResponse {
	access_token: string
	token_type: "Bearer"
	expires_in: number
	scope: string
	refresh_token?: string
	issued_token_type?: string
}

type TokenRequestBody = Record<string, unknown>

const field = (body: TokenRequestBody, name: string): string | undefined => {
	const value = body[name]
	return typeof value === "string" && value.length > 0 ? value : undefined
}

const required = (body: TokenRequestBody, name: string): string => {
	const value = field(body, name)
	if (!value) throw new OAuthError("invalid_request", `${name} is required.`)
	return value
}

const invalidGrant = (description: string): OAuthError =>
	new OAuthError("invalid_grant", description)

const requireGrantType = (client: ResolvedClient, grantType: string): void => {
	if (!client.grantTypes.includes(grantType)) {
		throw new OAuthError("unauthorized_client", `This client may not use ${grantType}.`)
	}
}

const resourceMatches = (requested: string | undefined, expected: string): void => {
	if (requested === undefined) return
	if (resolveResource(requested) !== expected) {
		throw new OAuthError("invalid_target", "The resource does not match the authorization.")
	}
}

const currentTokenVersion = async (userId: string): Promise<number | null> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { tokenVersion: true },
	})
	return user?.tokenVersion ?? null
}

const assertGrantStillValid = async (grant: LiveGrant | null): Promise<LiveGrant> => {
	if (!grant) throw invalidGrant("This connection has been revoked. Connect the app again.")
	const tokenVersion = await currentTokenVersion(grant.userId)
	if (tokenVersion === null || tokenVersion !== grant.tokenVersion) {
		throw invalidGrant("Your Sculpt credentials changed. Connect the app again.")
	}
	return grant
}

const issueRefreshToken = async (
	grant: LiveGrant,
	scopes: readonly Scope[],
	resource: string
): Promise<string> => {
	const token = generateSecret(REFRESH_TOKEN_PREFIX)
	await prisma.oAuthRefreshToken.create({
		data: {
			tokenHash: hashSecret(token),
			grantId: grant.id,
			scopes: [...scopes],
			resource,
			expiresAt: new Date(Date.now() + refreshTokenLifetimeMs()),
		},
	})
	return token
}

const issueTokens = async (
	client: ResolvedClient,
	grant: LiveGrant,
	scopes: readonly Scope[],
	resource: string
): Promise<TokenResponse> => {
	const access = await signAccessToken({
		userId: grant.userId,
		tokenVersion: grant.tokenVersion,
		grantId: grant.id,
		clientId: client.id,
		scopes,
		resource,
		lifetimeMs: accessTokenLifetimeMs(),
	})
	const refreshToken = client.grantTypes.includes(REFRESH_TOKEN_GRANT)
		? await issueRefreshToken(grant, scopes, resource)
		: undefined
	void noteClientUsed(client.id)
	void noteGrantUsed(grant.id)
	return {
		access_token: access.token,
		token_type: "Bearer",
		expires_in: access.expiresInSeconds,
		scope: formatScopes(scopes),
		...(refreshToken ? { refresh_token: refreshToken } : {}),
	}
}

const claimOnce = async (
	claim: () => Promise<{ count: number }>,
	description: string
): Promise<void> => {
	const { count } = await claim()
	if (count !== 1) throw invalidGrant(description)
}

const exchangeAuthorizationCode = async (
	client: ResolvedClient,
	body: TokenRequestBody
): Promise<TokenResponse> => {
	requireGrantType(client, AUTHORIZATION_CODE_GRANT)
	const codeHash = hashSecret(required(body, "code"))
	const record = await prisma.oAuthAuthorizationCode.findUnique({
		where: { codeHash },
		include: { grant: { select: { clientId: true, userId: true } } },
	})
	if (!record || record.grant.clientId !== client.id) {
		throw invalidGrant("The authorization code is invalid.")
	}
	if (record.usedAt) {
		await revokeGrant(record.grantId)
		await recordAudit({
			action: "oauth.authorization_code_reused",
			targetType: "oauth_grant",
			targetId: record.grantId,
			actorId: record.grant.userId,
			metadata: { clientId: client.id },
		})
		throw invalidGrant("The authorization code was already used.")
	}
	if (record.expiresAt <= new Date()) throw invalidGrant("The authorization code has expired.")
	const redirectUri = field(body, "redirect_uri")
	if (redirectUri !== undefined && redirectUri !== record.redirectUri) {
		throw invalidGrant("redirect_uri does not match the authorization request.")
	}
	if (!verifierMatchesChallenge(body.code_verifier, record.codeChallenge)) {
		throw invalidGrant("The PKCE code_verifier does not match.")
	}
	resourceMatches(field(body, "resource"), record.resource)

	await claimOnce(
		() =>
			prisma.oAuthAuthorizationCode.updateMany({
				where: { codeHash, usedAt: null },
				data: { usedAt: new Date() },
			}),
		"The authorization code was already used."
	)
	const grant = await assertGrantStillValid(await liveGrant(record.grantId))
	return issueTokens(
		client,
		grant,
		narrowScopes(grant.scopes, onlyKnownScopes(record.scopes)),
		record.resource
	)
}

const scopesForRefresh = (
	available: readonly Scope[],
	requested: string | undefined
): Scope[] => {
	if (!requested) return [...available]
	const parsed = parseScopeString(requested)
	if (parsed.unknown.length || parsed.scopes.some((scope) => !available.includes(scope))) {
		throw new OAuthError("invalid_scope", "A refresh cannot add scopes that were not granted.")
	}
	return parsed.scopes
}

const refreshAccessToken = async (
	client: ResolvedClient,
	body: TokenRequestBody
): Promise<TokenResponse> => {
	requireGrantType(client, REFRESH_TOKEN_GRANT)
	const tokenHash = hashSecret(required(body, "refresh_token"))
	const record = await prisma.oAuthRefreshToken.findUnique({
		where: { tokenHash },
		include: { grant: { select: { clientId: true, userId: true } } },
	})
	if (!record || record.grant.clientId !== client.id) {
		throw invalidGrant("The refresh token is invalid.")
	}
	if (record.usedAt) {
		await revokeGrant(record.grantId)
		await recordAudit({
			action: "oauth.refresh_token_reused",
			targetType: "oauth_grant",
			targetId: record.grantId,
			actorId: record.grant.userId,
			metadata: { clientId: client.id },
		})
		throw invalidGrant("The refresh token was already used, so the connection was revoked.")
	}
	if (record.expiresAt <= new Date()) throw invalidGrant("The refresh token has expired.")
	resourceMatches(field(body, "resource"), record.resource)

	const grant = await assertGrantStillValid(await liveGrant(record.grantId))
	const available = narrowScopes(grant.scopes, onlyKnownScopes(record.scopes))
	const scopes = scopesForRefresh(available, field(body, "scope"))

	await claimOnce(
		() =>
			prisma.oAuthRefreshToken.updateMany({
				where: { tokenHash, usedAt: null },
				data: { usedAt: new Date() },
			}),
		"The refresh token was already used."
	)
	return issueTokens(client, grant, scopes, record.resource)
}

const verifyGrantBackedClaims = async (
	token: string,
	audience: string
): Promise<{ claims: AccessTokenClaims; grant: LiveGrant } | null> => {
	const claims = await verifyAccessToken(token, audience)
	if (!claims) return null
	const grant = await liveGrant(claims.gid)
	if (!grant || grant.userId !== claims.sub) return null
	const tokenVersion = await currentTokenVersion(grant.userId)
	if (tokenVersion === null || tokenVersion !== claims.ver) return null
	return { claims, grant }
}

const exchangeDelegatedToken = async (
	client: ResolvedClient,
	body: TokenRequestBody
): Promise<TokenResponse> => {
	requireGrantType(client, TOKEN_EXCHANGE_GRANT)
	const subjectToken = required(body, "subject_token")
	if (required(body, "subject_token_type") !== ACCESS_TOKEN_TYPE_URN) {
		throw new OAuthError("invalid_request", "subject_token_type must be an access token.")
	}
	const requestedType = field(body, "requested_token_type")
	if (requestedType && requestedType !== ACCESS_TOKEN_TYPE_URN && requestedType !== JWT_TOKEN_TYPE_URN) {
		throw new OAuthError("invalid_request", "Only access tokens can be issued.")
	}
	const target = resolveResource(field(body, "resource") ?? field(body, "audience") ?? apiResource())
	if (target !== apiResource()) {
		throw new OAuthError("invalid_target", "Tokens can only be exchanged for the Sculpt API.")
	}
	const sourceAudience = mcpResource()
	if (!sourceAudience) {
		throw new OAuthError("invalid_target", "The MCP service is not configured on this server.")
	}

	const verified = await verifyGrantBackedClaims(subjectToken, sourceAudience)
	if (!verified) throw invalidGrant("The subject token is invalid, expired or revoked.")

	const available = narrowScopes(verified.grant.scopes, scopesOfClaims(verified.claims))
	const scopes = scopesForRefresh(available, field(body, "scope"))
	const delegated = await signAccessToken({
		userId: verified.grant.userId,
		tokenVersion: verified.grant.tokenVersion,
		grantId: verified.grant.id,
		clientId: verified.claims.client_id,
		scopes,
		resource: apiResource(),
		lifetimeMs: delegatedTokenLifetimeMs(),
		actor: { sub: client.id },
		notAfter: verified.claims.exp,
	})
	return {
		access_token: delegated.token,
		issued_token_type: ACCESS_TOKEN_TYPE_URN,
		token_type: "Bearer",
		expires_in: delegated.expiresInSeconds,
		scope: formatScopes(scopes),
	}
}

export const handleTokenRequest = async (
	client: ResolvedClient,
	body: TokenRequestBody
): Promise<TokenResponse> => {
	const grantType = required(body, "grant_type")
	if (grantType === AUTHORIZATION_CODE_GRANT) return exchangeAuthorizationCode(client, body)
	if (grantType === REFRESH_TOKEN_GRANT) return refreshAccessToken(client, body)
	if (grantType === TOKEN_EXCHANGE_GRANT) return exchangeDelegatedToken(client, body)
	throw new OAuthError("unsupported_grant_type", `${grantType} is not supported.`)
}

const verifiableAudiences = (): string[] =>
	[mcpResource(), apiResource()].filter((audience): audience is string => !!audience)

const verifyAnyAudience = async (token: string) => {
	for (const audience of verifiableAudiences()) {
		const verified = await verifyGrantBackedClaims(token, audience)
		if (verified) return verified
	}
	return null
}

export const revokeToken = async (client: ResolvedClient, body: TokenRequestBody): Promise<void> => {
	const token = required(body, "token")
	const refresh = await prisma.oAuthRefreshToken.findUnique({
		where: { tokenHash: hashSecret(token) },
		include: { grant: { select: { clientId: true, userId: true } } },
	})
	if (refresh) {
		if (refresh.grant.clientId === client.id) {
			await revokeGrant(refresh.grantId)
			await auditClientRevocation(refresh.grantId, refresh.grant.userId, client.id)
		}
		return
	}
	const verified = await verifyAnyAudience(token)
	if (verified && verified.claims.client_id === client.id) {
		await revokeGrant(verified.grant.id)
		await auditClientRevocation(verified.grant.id, verified.grant.userId, client.id)
	}
}

const auditClientRevocation = (grantId: string, userId: string, clientId: string) =>
	recordAudit({
		action: "oauth.grant_revoked",
		targetType: "oauth_grant",
		targetId: grantId,
		actorId: userId,
		metadata: { clientId, by: "client" },
	})

export const introspectToken = async (client: ResolvedClient, body: TokenRequestBody) => {
	if (client.id !== MCP_SERVICE_CLIENT_ID) {
		throw new OAuthError("unauthorized_client", "This client may not introspect tokens.", 403)
	}
	const token = required(body, "token")
	const personal = await verifyPersonalAccessToken(token)
	if (personal) {
		return {
			active: true,
			token_type: "personal_access_token",
			scope: formatScopes(personal.scopes),
			sub: personal.userId,
			iss: oauthIssuer(),
			...(personal.expiresAt ? { exp: Math.floor(personal.expiresAt.getTime() / 1000) } : {}),
		}
	}
	const verified = await verifyAnyAudience(token)
	if (!verified) return { active: false }
	const { claims, grant } = verified
	return {
		active: true,
		token_type: "Bearer",
		scope: formatScopes(narrowScopes(grant.scopes, scopesOfClaims(claims))),
		client_id: claims.client_id,
		sub: claims.sub,
		aud: claims.aud,
		iss: claims.iss,
		exp: claims.exp,
		iat: claims.iat,
		jti: claims.jti,
	}
}
