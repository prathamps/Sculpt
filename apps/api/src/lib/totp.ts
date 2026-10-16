import { createHmac, randomBytes, timingSafeEqual } from "crypto"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const SECRET_BYTES = 20
export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6
const ACCEPTED_CLOCK_DRIFT_STEPS = 1

export const base32Encode = (bytes: Buffer): string => {
	let bits = 0
	let value = 0
	let output = ""
	for (const byte of bytes) {
		value = (value << 8) | byte
		bits += 8
		while (bits >= 5) {
			output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
			bits -= 5
		}
	}
	if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
	return output
}

export const base32Decode = (encoded: string): Buffer => {
	const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "")
	let bits = 0
	let value = 0
	const bytes: number[] = []
	for (const character of clean) {
		value = (value << 5) | BASE32_ALPHABET.indexOf(character)
		bits += 5
		if (bits >= 8) {
			bytes.push((value >>> (bits - 8)) & 255)
			bits -= 8
		}
	}
	return Buffer.from(bytes)
}

export const generateTotpSecret = (): string => base32Encode(randomBytes(SECRET_BYTES))

export const totpStepAt = (unixMs: number): number =>
	Math.floor(unixMs / 1000 / TOTP_STEP_SECONDS)

export const hotp = (
	secret: Buffer,
	counter: number,
	digits = TOTP_DIGITS
): string => {
	const message = Buffer.alloc(8)
	message.writeBigUInt64BE(BigInt(counter))
	const digest = createHmac("sha1", secret).update(message).digest()
	const offset = digest[digest.length - 1]! & 15
	const binary =
		((digest[offset]! & 127) << 24) |
		(digest[offset + 1]! << 16) |
		(digest[offset + 2]! << 8) |
		digest[offset + 3]!
	return String(binary % 10 ** digits).padStart(digits, "0")
}

const sameCode = (expected: string, presented: string): boolean =>
	expected.length === presented.length &&
	timingSafeEqual(Buffer.from(expected), Buffer.from(presented))

export const matchingTotpStep = (
	secretBase32: string,
	presentedCode: string,
	nowMs: number,
	lastAcceptedStep: number | null
): number | null => {
	const code = presentedCode.replace(/\s/g, "")
	if (!/^\d{6}$/.test(code)) return null
	const secret = base32Decode(secretBase32)
	const current = totpStepAt(nowMs)
	for (
		let step = current - ACCEPTED_CLOCK_DRIFT_STEPS;
		step <= current + ACCEPTED_CLOCK_DRIFT_STEPS;
		step++
	) {
		if (lastAcceptedStep !== null && step <= lastAcceptedStep) continue
		if (sameCode(hotp(secret, step), code)) return step
	}
	return null
}

export const otpauthUri = (
	issuer: string,
	accountName: string,
	secretBase32: string
): string => {
	const label = encodeURIComponent(`${issuer}:${accountName}`)
	const params = new URLSearchParams({
		secret: secretBase32,
		issuer,
		algorithm: "SHA1",
		digits: String(TOTP_DIGITS),
		period: String(TOTP_STEP_SECONDS),
	})
	return `otpauth://totp/${label}?${params}`
}
