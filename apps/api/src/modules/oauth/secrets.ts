import { createHash, randomBytes, timingSafeEqual } from "crypto"

const SECRET_BYTES = 32

export const generateSecret = (prefix = ""): string =>
	`${prefix}${randomBytes(SECRET_BYTES).toString("base64url")}`

export const hashSecret = (secret: string): string =>
	createHash("sha256").update(secret).digest("hex")

export const secretMatchesHash = (presented: string, storedHash: string | null): boolean => {
	if (!storedHash) return false
	const presentedHash = Buffer.from(hashSecret(presented), "hex")
	const expected = Buffer.from(storedHash, "hex")
	return presentedHash.length === expected.length && timingSafeEqual(presentedHash, expected)
}

export const secretsEqual = (presented: string, expected: string): boolean => {
	const left = createHash("sha256").update(presented).digest()
	const right = createHash("sha256").update(expected).digest()
	return timingSafeEqual(left, right)
}
