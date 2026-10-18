import {
	JsonWebKey,
	KeyObject,
	createHash,
	createPrivateKey,
	createPublicKey,
	generateKeyPairSync,
} from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { openSecret, sealSecret } from "../../lib/secret-box"
import { logger } from "../../lib/logger"
import { retiredKeyPublicationMs, signingKeyRotationMs } from "./oauth.config"

export const SIGNING_ALGORITHM = "ES256"
const SIGNING_CURVE = "P-256"
const ACTIVE_KEY_CACHE_MS = 60000

export interface SigningKey {
	kid: string
	privateKey: KeyObject
	createdAt: Date
}

export interface PublishedJwk extends JsonWebKey {
	kid: string
	alg: string
	use: string
}

interface StoredSigningKey {
	kid: string
	publicJwk: Prisma.JsonValue
	privateKey: string
	createdAt: Date
	retiredAt: Date | null
}

const base64url = (buffer: Buffer): string => buffer.toString("base64url")

export const jwkThumbprint = (jwk: JsonWebKey): string =>
	base64url(
		createHash("sha256")
			.update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))
			.digest()
	)

let cachedActiveKey: { key: SigningKey; loadedAt: number } | null = null
const verificationKeys = new Map<string, KeyObject>()

export const forgetSigningKeys = (): void => {
	cachedActiveKey = null
	verificationKeys.clear()
}

const publicJwkOf = (stored: Pick<StoredSigningKey, "publicJwk">): JsonWebKey =>
	stored.publicJwk as JsonWebKey

const toSigningKey = (stored: StoredSigningKey): SigningKey => ({
	kid: stored.kid,
	privateKey: createPrivateKey(openSecret(stored.privateKey)),
	createdAt: stored.createdAt,
})

const generateSigningKey = async (): Promise<StoredSigningKey> => {
	const { privateKey, publicKey } = generateKeyPairSync("ec", {
		namedCurve: SIGNING_CURVE,
	})
	const publicJwk = publicKey.export({ format: "jwk" })
	const kid = jwkThumbprint(publicJwk)
	const stored = await prisma.oAuthSigningKey.create({
		data: {
			kid,
			algorithm: SIGNING_ALGORITHM,
			publicJwk: publicJwk as Prisma.InputJsonValue,
			privateKey: sealSecret(
				privateKey.export({ format: "pem", type: "pkcs8" }).toString()
			),
		},
	})
	logger.info("Generated a new OAuth signing key", { kid })
	return stored
}

const newestActiveKey = (): Promise<StoredSigningKey | null> =>
	prisma.oAuthSigningKey.findFirst({
		where: { retiredAt: null },
		orderBy: { createdAt: "desc" },
	})

export const isDueForRotation = (createdAt: Date, now = Date.now()): boolean =>
	now - createdAt.getTime() >= signingKeyRotationMs()

const retireAllExcept = async (kid: string): Promise<void> => {
	await prisma.oAuthSigningKey.updateMany({
		where: { retiredAt: null, kid: { not: kid } },
		data: { retiredAt: new Date() },
	})
}

export const rotateSigningKey = async (): Promise<SigningKey> => {
	const created = await generateSigningKey()
	await retireAllExcept(created.kid)
	const key = toSigningKey(created)
	cachedActiveKey = { key, loadedAt: Date.now() }
	return key
}

export const activeSigningKey = async (): Promise<SigningKey> => {
	if (cachedActiveKey && Date.now() - cachedActiveKey.loadedAt < ACTIVE_KEY_CACHE_MS) {
		return cachedActiveKey.key
	}
	const stored = (await newestActiveKey()) ?? (await generateSigningKey())
	const key = toSigningKey(stored)
	cachedActiveKey = { key, loadedAt: Date.now() }
	return key
}

export const verificationKey = async (kid: string): Promise<KeyObject | null> => {
	const cached = verificationKeys.get(kid)
	if (cached) return cached
	const stored = await prisma.oAuthSigningKey.findUnique({ where: { kid } })
	if (!stored || !isPublished(stored)) return null
	const key = createPublicKey({ key: publicJwkOf(stored), format: "jwk" })
	verificationKeys.set(kid, key)
	return key
}

const isPublished = (
	stored: Pick<StoredSigningKey, "retiredAt">,
	now = Date.now()
): boolean =>
	!stored.retiredAt || now - stored.retiredAt.getTime() < retiredKeyPublicationMs()

export const publishedJwks = async (): Promise<{ keys: PublishedJwk[] }> => {
	await activeSigningKey()
	const keys = await prisma.oAuthSigningKey.findMany({
		where: {
			OR: [
				{ retiredAt: null },
				{ retiredAt: { gt: new Date(Date.now() - retiredKeyPublicationMs()) } },
			],
		},
		orderBy: { createdAt: "desc" },
	})
	return {
		keys: keys.map((stored) => {
			const { kty, crv, x, y } = publicJwkOf(stored)
			return { kty, crv, x, y, kid: stored.kid, alg: stored.algorithm, use: "sig" }
		}),
	}
}

export const rotateSigningKeyIfDue = async (): Promise<boolean> => {
	const active = await newestActiveKey()
	if (active && !isDueForRotation(active.createdAt)) return false
	await rotateSigningKey()
	return true
}

export const pruneRetiredSigningKeys = async (): Promise<number> => {
	const { count } = await prisma.oAuthSigningKey.deleteMany({
		where: { retiredAt: { lt: new Date(Date.now() - retiredKeyPublicationMs()) } },
	})
	if (count > 0) verificationKeys.clear()
	return count
}
