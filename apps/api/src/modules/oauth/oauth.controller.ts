import { Request, Response } from "express"
import { recordAudit } from "../audit/audit.service"
import {
	apiProtectedResourceMetadata,
	authorizationServerMetadata,
} from "./metadata"
import { publishedJwks } from "./signing-keys.service"
import { beginAuthorization } from "./authorization.service"
import { parseClientRegistration } from "./client-metadata"
import {
	authenticateClient,
	isConfidential,
	registerDynamicClient,
} from "./clients.service"
import { dynamicRegistrationEnabled } from "./oauth.config"
import { OAuthError, preventCaching, respondWithOAuthError } from "./oauth-errors"
import { handleTokenRequest, introspectToken, revokeToken } from "./tokens.service"
import { hostOfRedirect } from "./grants.service"

const METADATA_CACHE_SECONDS = 300

const cacheablePublicly = (res: Response): void => {
	res.setHeader("Cache-Control", `public, max-age=${METADATA_CACHE_SECONDS}`)
}

export const serveAuthorizationServerMetadata = (_req: Request, res: Response): void => {
	cacheablePublicly(res)
	res.json(authorizationServerMetadata())
}

export const serveApiResourceMetadata = (_req: Request, res: Response): void => {
	cacheablePublicly(res)
	res.json(apiProtectedResourceMetadata())
}

export const serveJwks = async (_req: Request, res: Response): Promise<void> => {
	try {
		cacheablePublicly(res)
		res.json(await publishedJwks())
	} catch (error) {
		respondWithOAuthError(res, error, "publish JWKS")
	}
}

export const authorize = async (req: Request, res: Response): Promise<void> => {
	try {
		const outcome = await beginAuthorization(req.query as Record<string, string | string[]>)
		preventCaching(res)
		res.redirect(302, outcome.location)
	} catch (error) {
		respondWithOAuthError(res, error, "authorize")
	}
}

export const registerClient = async (req: Request, res: Response): Promise<void> => {
	try {
		if (!dynamicRegistrationEnabled()) {
			throw new OAuthError(
				"access_denied",
				"Dynamic client registration is turned off on this server.",
				403
			)
		}
		const registration = parseClientRegistration(req.body)
		const { client, clientSecret, issuedAt } = await registerDynamicClient(registration)
		await recordAudit({
			action: "oauth.client_registered",
			targetType: "oauth_client",
			targetId: client.id,
			metadata: {
				name: client.name,
				redirectHosts: client.redirectUris.map(hostOfRedirect),
				confidential: isConfidential(client),
			},
		})
		preventCaching(res)
		res.status(201).json({
			client_id: client.id,
			client_id_issued_at: Math.floor(issuedAt.getTime() / 1000),
			...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
			client_name: client.name,
			redirect_uris: client.redirectUris,
			grant_types: client.grantTypes,
			response_types: ["code"],
			token_endpoint_auth_method: client.tokenEndpointAuthMethod,
			...(client.scope ? { scope: client.scope } : {}),
			...(client.clientUri ? { client_uri: client.clientUri } : {}),
			...(client.logoUri ? { logo_uri: client.logoUri } : {}),
		})
	} catch (error) {
		respondWithOAuthError(res, error, "register client")
	}
}

export const issueToken = async (req: Request, res: Response): Promise<void> => {
	try {
		const client = await authenticateClient(req)
		const tokens = await handleTokenRequest(client, req.body ?? {})
		preventCaching(res)
		res.status(200).json(tokens)
	} catch (error) {
		respondWithOAuthError(res, error, "issue token")
	}
}

export const revoke = async (req: Request, res: Response): Promise<void> => {
	try {
		const client = await authenticateClient(req)
		await revokeToken(client, req.body ?? {})
		preventCaching(res)
		res.status(200).send()
	} catch (error) {
		respondWithOAuthError(res, error, "revoke token")
	}
}

export const introspect = async (req: Request, res: Response): Promise<void> => {
	try {
		const client = await authenticateClient(req)
		preventCaching(res)
		res.status(200).json(await introspectToken(client, req.body ?? {}))
	} catch (error) {
		respondWithOAuthError(res, error, "introspect token")
	}
}
