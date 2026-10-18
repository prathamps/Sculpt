import { OAuthClientKind } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { TtlCache, cachePositive } from "../../lib/ttl-cache"
import { NotFoundError } from "../../lib/errors"
import { Scope, onlyKnownScopes } from "./scopes"

const LIVE_GRANT_CACHE_MS = 5000
const LAST_USED_WRITE_INTERVAL_MS = 60000

export interface LiveGrant {
	id: string
	userId: string
	clientId: string
	scopes: Scope[]
	resource: string
	tokenVersion: number
}

const liveGrants = new TtlCache<LiveGrant>(LIVE_GRANT_CACHE_MS)
const lastUsedWrites = new TtlCache<true>(LAST_USED_WRITE_INTERVAL_MS)

export const forgetLiveGrant = (grantId: string): void => liveGrants.delete(grantId)

export const forgetLiveGrantsWhere = (matches: (grant: LiveGrant) => boolean): void =>
	liveGrants.deleteWhere((grant) => matches(grant))

export const clearGrantCaches = (): void => {
	liveGrants.clear()
	lastUsedWrites.clear()
}

export const liveGrant = (grantId: string): Promise<LiveGrant | null> =>
	cachePositive(liveGrants, grantId, async () => {
		const grant = await prisma.oAuthGrant.findFirst({
			where: { id: grantId, revokedAt: null, client: { disabledAt: null } },
			select: {
				id: true,
				userId: true,
				clientId: true,
				scopes: true,
				resource: true,
				tokenVersion: true,
			},
		})
		return grant ? { ...grant, scopes: onlyKnownScopes(grant.scopes) } : null
	})

export const noteGrantUsed = async (grantId: string): Promise<void> => {
	if (lastUsedWrites.get(grantId)) return
	lastUsedWrites.set(grantId, true)
	await prisma.oAuthGrant
		.update({ where: { id: grantId }, data: { lastUsedAt: new Date() } })
		.catch(() => undefined)
}

export interface GrantRequest {
	userId: string
	clientId: string
	resource: string
	scopes: readonly Scope[]
	requestedScopes: readonly Scope[]
	tokenVersion: number
}

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const activeGrantWhere = (userId: string, clientId: string, resource: string) => ({
	where: { userId, clientId, resource, revokedAt: null },
	orderBy: { createdAt: "desc" as const },
})

export const findActiveGrant = (userId: string, clientId: string, resource: string) =>
	prisma.oAuthGrant.findFirst(activeGrantWhere(userId, clientId, resource))

const grantLockKey = (request: GrantRequest): string =>
	`oauth_grant:${request.userId}:${request.clientId}:${request.resource}`

const lockGrantsOf = (tx: Transaction, request: GrantRequest) =>
	tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${grantLockKey(request)}, 0))`

const revokeGrantWithin = async (tx: Transaction, grantId: string): Promise<boolean> => {
	const { count } = await tx.oAuthGrant.updateMany({
		where: { id: grantId, revokedAt: null },
		data: { revokedAt: new Date() },
	})
	await tx.oAuthRefreshToken.deleteMany({ where: { grantId } })
	await tx.oAuthAuthorizationCode.deleteMany({ where: { grantId } })
	return count > 0
}

export const recordConsent = async (request: GrantRequest): Promise<LiveGrant> => {
	const data = {
		scopes: [...request.scopes],
		requestedScopes: [...request.requestedScopes],
		tokenVersion: request.tokenVersion,
	}
	const { grant, replacedGrantId } = await prisma.$transaction(async (tx) => {
		await lockGrantsOf(tx, request)
		const existing = await tx.oAuthGrant.findFirst(
			activeGrantWhere(request.userId, request.clientId, request.resource)
		)
		if (existing && existing.tokenVersion === request.tokenVersion) {
			const updated = await tx.oAuthGrant.update({ where: { id: existing.id }, data })
			return { grant: updated, replacedGrantId: null }
		}
		if (existing) await revokeGrantWithin(tx, existing.id)
		const created = await tx.oAuthGrant.create({
			data: {
				...data,
				userId: request.userId,
				clientId: request.clientId,
				resource: request.resource,
			},
		})
		return { grant: created, replacedGrantId: existing?.id ?? null }
	})
	if (replacedGrantId) forgetLiveGrant(replacedGrantId)
	forgetLiveGrant(grant.id)
	return { ...grant, scopes: onlyKnownScopes(grant.scopes) }
}

export const coversScopes = (
	granted: readonly string[],
	requested: readonly string[]
): boolean => requested.every((scope) => granted.includes(scope))

export const revokeGrant = async (grantId: string): Promise<boolean> => {
	const revoked = await prisma.$transaction((tx) => revokeGrantWithin(tx, grantId))
	forgetLiveGrant(grantId)
	return revoked
}

const revokeActiveGrants = async (where: { userId: string } | { clientId: string }) => {
	const grants = await prisma.oAuthGrant.findMany({
		where: { ...where, revokedAt: null },
		select: { id: true },
	})
	for (const grant of grants) await revokeGrant(grant.id)
	return grants.length
}

export const revokeGrantOfUser = async (grantId: string, userId: string) => {
	const grant = await prisma.oAuthGrant.findFirst({
		where: { id: grantId, userId, revokedAt: null },
		select: { id: true, clientId: true },
	})
	if (!grant) throw new NotFoundError("Connection not found")
	await revokeGrant(grant.id)
	return grant
}

export const revokeGrantsOfClient = (clientId: string): Promise<number> =>
	revokeActiveGrants({ clientId })

export const revokeGrantsOfUser = (userId: string): Promise<number> =>
	revokeActiveGrants({ userId })

export const listConnectionsOfUser = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { tokenVersion: true },
	})
	if (!user) return []
	const grants = await prisma.oAuthGrant.findMany({
		where: { userId, revokedAt: null, tokenVersion: user.tokenVersion },
		orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
		select: {
			id: true,
			scopes: true,
			resource: true,
			createdAt: true,
			updatedAt: true,
			lastUsedAt: true,
			client: {
				select: {
					id: true,
					name: true,
					kind: true,
					clientUri: true,
					logoUri: true,
					redirectUris: true,
					disabledAt: true,
					verifiedAt: true,
				},
			},
		},
	})
	return grants.map(({ client, ...grant }) => ({
		...grant,
		scopes: onlyKnownScopes(grant.scopes),
		client: {
			id: client.id,
			name: client.name,
			kind: client.kind,
			clientUri: client.clientUri,
			logoUri: client.logoUri,
			disabled: !!client.disabledAt,
			verified: !!client.verifiedAt || client.kind === OAuthClientKind.FIRST_PARTY,
			redirectHosts: Array.from(new Set(client.redirectUris.map(hostOfRedirect))),
		},
	}))
}

export const hostOfRedirect = (redirectUri: string): string => {
	try {
		const url = new URL(redirectUri)
		return url.host || `${url.protocol}//`
	} catch {
		return redirectUri
	}
}
