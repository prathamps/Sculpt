import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { jwtSecret } from "./config"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const KEY_BYTES = 32
const FORMAT_VERSION = "v1"

const configuredKey = (): Buffer | null => {
	const raw = process.env.MFA_ENCRYPTION_KEY?.trim()
	if (!raw) return null
	const key = Buffer.from(raw, "base64")
	if (key.length !== KEY_BYTES) {
		throw new Error(
			"MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)."
		)
	}
	return key
}

export const hasDedicatedEncryptionKey = (): boolean => !!process.env.MFA_ENCRYPTION_KEY?.trim()

const encryptionKey = (): Buffer =>
	configuredKey() ??
	createHash("sha256").update(`sculpt-secret-box:${jwtSecret()}`).digest()

export const sealSecret = (plaintext: string): string => {
	const iv = randomBytes(IV_BYTES)
	const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
	return [
		FORMAT_VERSION,
		iv.toString("base64"),
		cipher.getAuthTag().toString("base64"),
		ciphertext.toString("base64"),
	].join(":")
}

export const openSecret = (sealed: string): string => {
	const [version, iv, tag, ciphertext] = sealed.split(":")
	if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) {
		throw new Error("Unrecognised sealed secret format")
	}
	const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64"))
	decipher.setAuthTag(Buffer.from(tag, "base64"))
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, "base64")),
		decipher.final(),
	]).toString("utf8")
}
