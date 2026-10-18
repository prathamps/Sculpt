import { prisma } from "../../lib/prisma"
import { TtlCache } from "../../lib/ttl-cache"
import { NotFoundError, ValidationError } from "../../lib/errors"
import { Scope, onlyKnownScopes } from "./scopes"
import { generateSecret, hashSecret } from "./secrets"

export const PERSONAL_ACCESS_TOKEN_PREFIX = "sculpt_pat_"
export const MAX_PERSONAL_ACCESS_TOKENS_PER_USER = 50
const VERIFIED_TOKEN_CACHE_MS = 5000
const LAST_USED_WRITE_INTERVAL_MS = 60000
const DAY_MS = 24 * 3600000
const VISIBLE_SUFFIX_LENGTH = 4

export interface VerifiedPersonalAccessToken {
	id: string
	userId: string
	scopes: Scope[]
	expiresAt: Date | null
}

const verifiedTokens = new TtlCache<VerifiedPersonalAccessToken>(VERIFIED_TOKEN_CACHE_MS)
const lastUsedWrites = new TtlCache<true>(LAST_USED_WRITE_INTERVAL_MS)

export const clearPersonalTokenCaches = (): void => {
	verifiedTokens.clear()
	lastUsedWrites.clear()
}

export const isPersonalAccessToken = (token: string): boolean =>
	token.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX)

const isExpired = (expiresAt: Date | null, now = Date.now()): boolean =>
	!!expiresAt && expiresAt.getTime() <= now

export const verifyPersonalAccessToken = async (
	token: string
): Promise<VerifiedPersonalAccessToken | null> => {
	if (!isPersonalAccessToken(token)) return null
	const tokenHash = hashSecret(token)
	const cached = verifiedTokens.get(tokenHash)
	if (cached) return isExpired(cached.expiresAt) ? null : cached

	const record = await prisma.personalAccessToken.findUnique({
		where: { tokenHash },
		select: { id: true, userId: true, scopes: true, expiresAt: true, revokedAt: true },
	})
	if (!record || record.revokedAt || isExpired(record.expiresAt)) return null

	const verified = {
		id: record.id,
		userId: record.userId,
		scopes: onlyKnownScopes(record.scopes),
		expiresAt: record.expiresAt,
	}
	verifiedTokens.set(tokenHash, verified)
	return verified
}

export const notePersonalTokenUsed = async (tokenId: string): Promise<void> => {
	if (lastUsedWrites.get(tokenId)) return
	lastUsedWrites.set(tokenId, true)
	await prisma.personalAccessToken
		.update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
		.catch(() => undefined)
}

export interface NewPersonalAccessToken {
	name: string
	scopes: Scope[]
	expiresInDays: number
}

const publicFields = {
	id: true,
	name: true,
	lastFour: true,
	scopes: true,
	expiresAt: true,
	lastUsedAt: true,
	createdAt: true,
} as const

export const createPersonalAccessToken = async (
	userId: string,
	request: NewPersonalAccessToken
) => {
	if (request.scopes.length === 0) {
		throw new ValidationError("Choose at least one permission for the token.")
	}
	const existing = await prisma.personalAccessToken.count({
		where: { userId, revokedAt: null },
	})
	if (existing >= MAX_PERSONAL_ACCESS_TOKENS_PER_USER) {
		throw new ValidationError(
			`You already have ${MAX_PERSONAL_ACCESS_TOKENS_PER_USER} active tokens. Revoke one you no longer use first.`
		)
	}
	const token = generateSecret(PERSONAL_ACCESS_TOKEN_PREFIX)
	const record = await prisma.personalAccessToken.create({
		data: {
			userId,
			name: request.name,
			tokenHash: hashSecret(token),
			lastFour: token.slice(-VISIBLE_SUFFIX_LENGTH),
			scopes: [...request.scopes],
			expiresAt: new Date(Date.now() + request.expiresInDays * DAY_MS),
		},
		select: publicFields,
	})
	return { token, ...record, scopes: onlyKnownScopes(record.scopes) }
}

export const listPersonalAccessTokens = async (userId: string) => {
	const tokens = await prisma.personalAccessToken.findMany({
		where: { userId, revokedAt: null },
		orderBy: { createdAt: "desc" },
		select: publicFields,
	})
	return tokens.map((token) => ({
		...token,
		scopes: onlyKnownScopes(token.scopes),
		expired: isExpired(token.expiresAt),
	}))
}

export const revokePersonalAccessToken = async (
	userId: string,
	tokenId: string
): Promise<{ id: string; name: string }> => {
	const token = await prisma.personalAccessToken.findFirst({
		where: { id: tokenId, userId, revokedAt: null },
		select: { id: true, name: true, tokenHash: true },
	})
	if (!token) throw new NotFoundError("Token not found")
	await prisma.personalAccessToken.update({
		where: { id: token.id },
		data: { revokedAt: new Date() },
	})
	verifiedTokens.delete(token.tokenHash)
	return { id: token.id, name: token.name }
}

export const revokePersonalAccessTokensOfUser = async (userId: string): Promise<number> => {
	const { count } = await prisma.personalAccessToken.updateMany({
		where: { userId, revokedAt: null },
		data: { revokedAt: new Date() },
	})
	verifiedTokens.deleteWhere((token) => token.userId === userId)
	return count
}
