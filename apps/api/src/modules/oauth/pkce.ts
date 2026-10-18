import { createHash, timingSafeEqual } from "crypto"

export const PKCE_METHOD = "S256"

const PKCE_VALUE = /^[A-Za-z0-9\-._~]{43,128}$/

export const isWellFormedPkceValue = (value: unknown): value is string =>
	typeof value === "string" && PKCE_VALUE.test(value)

export const challengeForVerifier = (verifier: string): string =>
	createHash("sha256").update(verifier).digest("base64url")

export const verifierMatchesChallenge = (verifier: unknown, challenge: string): boolean => {
	if (!isWellFormedPkceValue(verifier)) return false
	const computed = Buffer.from(challengeForVerifier(verifier))
	const expected = Buffer.from(challenge)
	return computed.length === expected.length && timingSafeEqual(computed, expected)
}
