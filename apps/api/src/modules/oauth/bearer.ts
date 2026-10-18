import { Request } from "express"
import { prisma } from "../../lib/prisma"
import { TtlCache, cachePositive } from "../../lib/ttl-cache"
import { RequestAuth } from "../../lib/request-auth"
import { AuthenticatedUser } from "../../types"
import { apiResource, oauthIssuer } from "./oauth.config"
import { scopesOfClaims, verifyAccessToken } from "./access-tokens"
import { liveGrant, noteGrantUsed } from "./grants.service"
import { narrowScopes } from "./scopes"
import {
	isPersonalAccessToken,
	notePersonalTokenUsed,
	verifyPersonalAccessToken,
} from "./personal-tokens.service"

const DELEGATED_USER_CACHE_MS = 5000
const BEARER_PATTERN = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i

export interface BearerIdentity {
	user: AuthenticatedUser
	auth: RequestAuth
}

const delegatedUsers = new TtlCache<AuthenticatedUser>(DELEGATED_USER_CACHE_MS)

export const forgetDelegatedUser = (userId: string): void => delegatedUsers.delete(userId)

export const clearDelegatedUsers = (): void => delegatedUsers.clear()

const userById = (userId: string): Promise<AuthenticatedUser | null> =>
	cachePositive(delegatedUsers, userId, () =>
		prisma.user.findUnique({ where: { id: userId } })
	)

export const hasAuthorizationHeader = (req: Pick<Request, "headers">): boolean =>
	typeof req.headers.authorization === "string" && req.headers.authorization.length > 0

export const bearerTokenOf = (req: Pick<Request, "headers">): string | null => {
	const header = req.headers.authorization
	if (typeof header !== "string") return null
	return BEARER_PATTERN.exec(header.trim())?.[1] ?? null
}

const identityFromAccessToken = async (token: string): Promise<BearerIdentity | null> => {
	const claims = await verifyAccessToken(token, apiResource())
	if (!claims) return null
	const grant = await liveGrant(claims.gid)
	if (!grant || grant.userId !== claims.sub) return null
	const user = await userById(claims.sub)
	if (!user || user.tokenVersion !== claims.ver || grant.tokenVersion !== user.tokenVersion) {
		return null
	}
	void noteGrantUsed(grant.id)
	return {
		user,
		auth: {
			method: "oauth",
			scopes: new Set(narrowScopes(grant.scopes, scopesOfClaims(claims))),
			clientId: claims.client_id,
			grantId: grant.id,
			tokenId: claims.jti,
			actorClientId: claims.act?.sub ?? null,
		},
	}
}

const identityFromPersonalToken = async (token: string): Promise<BearerIdentity | null> => {
	const verified = await verifyPersonalAccessToken(token)
	if (!verified) return null
	const user = await userById(verified.userId)
	if (!user) return null
	void notePersonalTokenUsed(verified.id)
	return {
		user,
		auth: {
			method: "personal_access_token",
			scopes: new Set(verified.scopes),
			clientId: null,
			grantId: null,
			tokenId: verified.id,
			actorClientId: null,
		},
	}
}

export const authenticateBearerToken = (token: string): Promise<BearerIdentity | null> =>
	isPersonalAccessToken(token)
		? identityFromPersonalToken(token)
		: identityFromAccessToken(token)

export const protectedResourceMetadataUrl = (): string =>
	`${apiResource()}/.well-known/oauth-protected-resource`

const quoted = (value: string): string => `"${value.replace(/["\\]/g, "")}"`

export const bearerChallenge = (
	parameters: { error?: string; description?: string; scope?: string } = {}
): string =>
	[
		`realm=${quoted(oauthIssuer())}`,
		parameters.error ? `error=${quoted(parameters.error)}` : null,
		parameters.description ? `error_description=${quoted(parameters.description)}` : null,
		parameters.scope ? `scope=${quoted(parameters.scope)}` : null,
		`resource_metadata=${quoted(protectedResourceMetadataUrl())}`,
	]
		.filter(Boolean)
		.join(", ")
		.replace(/^/, "Bearer ")
