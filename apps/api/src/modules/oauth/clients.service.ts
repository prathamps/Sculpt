import { Request } from "express"
import { OAuthClientKind } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { fetchPublicJson } from "../../lib/safe-fetch"
import { requestedPage, paginated, skipTake } from "../../lib/pagination"
import { NotFoundError } from "../../lib/errors"
import {
	ClientRegistration,
	PUBLIC_CLIENT_AUTH_METHOD,
	TOKEN_EXCHANGE_GRANT,
	parseClientRegistration,
} from "./client-metadata"
import {
	MCP_SERVICE_CLIENT_ID,
	mcpServiceClientSecret,
	metadataDocumentClientsEnabled,
} from "./oauth.config"
import { OAuthError, invalidClient } from "./oauth-errors"
import { generateSecret, hashSecret, secretMatchesHash, secretsEqual } from "./secrets"
import { revokeGrantsOfClient } from "./grants.service"

const CLIENT_ID_PREFIX = "sculpt_client_"
const CLIENT_SECRET_PREFIX = "sculpt_secret_"
const MIN_METADATA_CACHE_SECONDS = 300
const MAX_METADATA_CACHE_SECONDS = 24 * 3600
const DEFAULT_METADATA_CACHE_SECONDS = 3600
const MAX_METADATA_DOCUMENT_URL_LENGTH = 2000
const UNUSED_DYNAMIC_CLIENT_RETENTION_MS = 7 * 24 * 3600000

export interface ResolvedClient {
	id: string
	kind: OAuthClientKind
	name: string
	redirectUris: string[]
	grantTypes: string[]
	tokenEndpointAuthMethod: string
	secretHash: string | null
	scope: string | null
	clientUri: string | null
	logoUri: string | null
	disabled: boolean
	verified: boolean
	registeredAt: Date | null
}

type StoredClient = Awaited<ReturnType<typeof prisma.oAuthClient.findUnique>>

const resolvedFrom = (stored: NonNullable<StoredClient>): ResolvedClient => ({
	id: stored.id,
	kind: stored.kind,
	name: stored.name,
	redirectUris: stored.redirectUris,
	grantTypes: stored.grantTypes,
	tokenEndpointAuthMethod: stored.tokenEndpointAuthMethod,
	secretHash: stored.secretHash,
	scope: stored.scope,
	clientUri: stored.clientUri,
	logoUri: stored.logoUri,
	disabled: !!stored.disabledAt,
	verified: !!stored.verifiedAt,
	registeredAt: stored.createdAt,
})

export const mcpServiceClient = (): ResolvedClient => ({
	id: MCP_SERVICE_CLIENT_ID,
	kind: OAuthClientKind.FIRST_PARTY,
	name: "Sculpt MCP service",
	redirectUris: [],
	grantTypes: [TOKEN_EXCHANGE_GRANT],
	tokenEndpointAuthMethod: "client_secret_basic",
	secretHash: null,
	scope: null,
	clientUri: null,
	logoUri: null,
	disabled: !mcpServiceClientSecret(),
	verified: true,
	registeredAt: null,
})

export const isMetadataDocumentClientId = (clientId: string): boolean => {
	if (clientId.length > MAX_METADATA_DOCUMENT_URL_LENGTH) return false
	try {
		const url = new URL(clientId)
		return (
			url.protocol === "https:" &&
			url.pathname.length > 1 &&
			!url.hash &&
			!url.username &&
			!url.password
		)
	} catch {
		return false
	}
}

const metadataCacheSeconds = (maxAge: number | null): number =>
	Math.min(
		MAX_METADATA_CACHE_SECONDS,
		Math.max(MIN_METADATA_CACHE_SECONDS, maxAge ?? DEFAULT_METADATA_CACHE_SECONDS)
	)

const allowsPrivateNetworkMetadata = (): boolean =>
	process.env.OAUTH_CIMD_ALLOW_PRIVATE_NETWORK?.trim().toLowerCase() === "true"

export const parseMetadataDocument = (clientId: string, document: unknown): ClientRegistration => {
	const declaredId = (document as { client_id?: unknown } | null)?.client_id
	if (declaredId !== clientId) {
		throw new OAuthError(
			"invalid_client",
			"The client metadata document must declare a client_id equal to its own URL.",
			401
		)
	}
	const registration = parseClientRegistration(document)
	if (registration.tokenEndpointAuthMethod !== PUBLIC_CLIENT_AUTH_METHOD) {
		throw new OAuthError(
			"invalid_client",
			'Client metadata documents must use token_endpoint_auth_method "none".',
			401
		)
	}
	return registration
}

const fetchMetadataDocument = async (clientId: string) => {
	const { body, maxAgeSeconds } = await fetchPublicJson(clientId, {
		allowPrivateNetwork: allowsPrivateNetworkMetadata(),
	})
	return {
		registration: parseMetadataDocument(clientId, body),
		expiresAt: new Date(Date.now() + metadataCacheSeconds(maxAgeSeconds) * 1000),
	}
}

const registrationColumns = (registration: ClientRegistration) => ({
	name: registration.name,
	redirectUris: registration.redirectUris,
	grantTypes: registration.grantTypes,
	tokenEndpointAuthMethod: registration.tokenEndpointAuthMethod,
	scope: registration.scope,
	clientUri: registration.clientUri,
	logoUri: registration.logoUri,
	softwareId: registration.softwareId,
	softwareVersion: registration.softwareVersion,
})

const resolveMetadataDocumentClient = async (
	clientId: string
): Promise<ResolvedClient | null> => {
	const cached = await prisma.oAuthClient.findUnique({ where: { id: clientId } })
	if (cached && cached.metadataExpiresAt && cached.metadataExpiresAt > new Date()) {
		return resolvedFrom(cached)
	}
	try {
		const { registration, expiresAt } = await fetchMetadataDocument(clientId)
		const stored = await prisma.oAuthClient.upsert({
			where: { id: clientId },
			update: { ...registrationColumns(registration), metadataExpiresAt: expiresAt },
			create: {
				id: clientId,
				kind: OAuthClientKind.METADATA_DOCUMENT,
				...registrationColumns(registration),
				metadataExpiresAt: expiresAt,
			},
		})
		return resolvedFrom(stored)
	} catch (error) {
		if (error instanceof OAuthError) throw error
		logger.warn("Client metadata document could not be fetched", {
			clientHost: new URL(clientId).host,
			detail: error instanceof Error ? error.message : undefined,
		})
		return cached ? resolvedFrom(cached) : null
	}
}

export const findClient = async (clientId: string): Promise<ResolvedClient | null> => {
	if (!clientId) return null
	if (clientId === MCP_SERVICE_CLIENT_ID) return mcpServiceClient()
	if (isMetadataDocumentClientId(clientId)) {
		return metadataDocumentClientsEnabled() ? resolveMetadataDocumentClient(clientId) : null
	}
	const stored = await prisma.oAuthClient.findUnique({ where: { id: clientId } })
	return stored ? resolvedFrom(stored) : null
}

export const isConfidential = (client: Pick<ResolvedClient, "tokenEndpointAuthMethod">): boolean =>
	client.tokenEndpointAuthMethod !== PUBLIC_CLIENT_AUTH_METHOD

export const registerDynamicClient = async (registration: ClientRegistration) => {
	const clientId = generateSecret(CLIENT_ID_PREFIX)
	const clientSecret = isConfidential(registration) ? generateSecret(CLIENT_SECRET_PREFIX) : null
	const stored = await prisma.oAuthClient.create({
		data: {
			id: clientId,
			kind: OAuthClientKind.DYNAMIC,
			...registrationColumns(registration),
			secretHash: clientSecret ? hashSecret(clientSecret) : null,
		},
	})
	return { client: resolvedFrom(stored), clientSecret, issuedAt: stored.createdAt }
}

interface PresentedCredentials {
	clientId: string | null
	clientSecret: string | null
}

const decodeFormComponent = (value: string): string =>
	decodeURIComponent(value.replace(/\+/g, " "))

export const presentedClientCredentials = (req: Request): PresentedCredentials => {
	const header = req.headers.authorization
	if (typeof header === "string" && /^Basic\s+/i.test(header)) {
		const decoded = Buffer.from(header.replace(/^Basic\s+/i, ""), "base64").toString("utf8")
		const separator = decoded.indexOf(":")
		if (separator < 0) throw invalidClient("Malformed Basic authorization header.")
		return {
			clientId: decodeFormComponent(decoded.slice(0, separator)),
			clientSecret: decodeFormComponent(decoded.slice(separator + 1)),
		}
	}
	const body = (req.body ?? {}) as Record<string, unknown>
	return {
		clientId: typeof body.client_id === "string" ? body.client_id : null,
		clientSecret: typeof body.client_secret === "string" ? body.client_secret : null,
	}
}

export const presentsMcpServiceCredentials = (req: Request): boolean => {
	try {
		const { clientId, clientSecret } = presentedClientCredentials(req)
		const expected = mcpServiceClientSecret()
		return (
			clientId === MCP_SERVICE_CLIENT_ID &&
			!!clientSecret &&
			!!expected &&
			secretsEqual(clientSecret, expected)
		)
	} catch {
		return false
	}
}

const secretIsValid = (client: ResolvedClient, secret: string): boolean => {
	if (client.id === MCP_SERVICE_CLIENT_ID) {
		const expected = mcpServiceClientSecret()
		return !!expected && secretsEqual(secret, expected)
	}
	return secretMatchesHash(secret, client.secretHash)
}

export const authenticateClient = async (req: Request): Promise<ResolvedClient> => {
	const { clientId, clientSecret } = presentedClientCredentials(req)
	if (!clientId) throw invalidClient("client_id is required.")
	const client = await findClient(clientId)
	if (!client || client.disabled) throw invalidClient("Unknown or disabled client.")
	if (!isConfidential(client)) return client
	if (!clientSecret || !secretIsValid(client, clientSecret)) {
		throw invalidClient("Client authentication failed.")
	}
	return client
}

export const noteClientUsed = async (clientId: string): Promise<void> => {
	if (clientId === MCP_SERVICE_CLIENT_ID) return
	await prisma.oAuthClient
		.update({ where: { id: clientId }, data: { lastUsedAt: new Date() } })
		.catch(() => undefined)
}

export const listClientsForAdmin = async (query: unknown) => {
	const page = requestedPage(query)
	const [total, clients] = await Promise.all([
		prisma.oAuthClient.count(),
		prisma.oAuthClient.findMany({
			orderBy: { createdAt: "desc" },
			...skipTake(page),
			select: {
				id: true,
				kind: true,
				name: true,
				clientUri: true,
				redirectUris: true,
				tokenEndpointAuthMethod: true,
				verifiedAt: true,
				disabledAt: true,
				lastUsedAt: true,
				createdAt: true,
				_count: { select: { grants: { where: { revokedAt: null } } } },
			},
		}),
	])
	return paginated(
		clients.map(({ _count, ...client }) => ({ ...client, activeGrants: _count.grants })),
		total,
		page
	)
}

export interface ClientUpdate {
	disabled?: boolean
	verified?: boolean
}

export const updateClientByAdmin = async (clientId: string, update: ClientUpdate) => {
	const client = await prisma.oAuthClient.findUnique({
		where: { id: clientId },
		select: { id: true },
	})
	if (!client) throw new NotFoundError("Client not found")
	const now = new Date()
	const updated = await prisma.oAuthClient.update({
		where: { id: clientId },
		data: {
			...(update.disabled === undefined ? {} : { disabledAt: update.disabled ? now : null }),
			...(update.verified === undefined ? {} : { verifiedAt: update.verified ? now : null }),
		},
		select: { id: true, name: true, disabledAt: true, verifiedAt: true },
	})
	const revokedGrants = update.disabled ? await revokeGrantsOfClient(clientId) : 0
	return { ...updated, revokedGrants }
}

export const pruneUnusedDynamicClients = async (): Promise<number> => {
	const { count } = await prisma.oAuthClient.deleteMany({
		where: {
			kind: { in: [OAuthClientKind.DYNAMIC, OAuthClientKind.METADATA_DOCUMENT] },
			lastUsedAt: null,
			createdAt: { lt: new Date(Date.now() - UNUSED_DYNAMIC_CLIENT_RETENTION_MS) },
			grants: { none: {} },
		},
	})
	return count
}
