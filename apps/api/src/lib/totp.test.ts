import { describe, expect, it } from "vitest"
import {
	base32Decode,
	base32Encode,
	generateTotpSecret,
	hotp,
	matchingTotpStep,
	otpauthUri,
	totpStepAt,
} from "./totp"

const RFC_SECRET = Buffer.from("12345678901234567890")

describe("hotp", () => {
	it("matches the RFC 4226 reference values", () => {
		expect(hotp(RFC_SECRET, 0)).toBe("755224")
		expect(hotp(RFC_SECRET, 1)).toBe("287082")
		expect(hotp(RFC_SECRET, 9)).toBe("520489")
	})

	it("matches the RFC 6238 SHA-1 reference at 59 seconds", () => {
		expect(hotp(RFC_SECRET, totpStepAt(59_000), 8)).toBe("94287082")
	})
})

describe("base32", () => {
	it("round-trips arbitrary bytes", () => {
		const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255])
		expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
	})

	it("encodes the RFC 4648 example", () => {
		expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI")
	})

	it("generates secrets an authenticator app can read", () => {
		expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/)
	})
})

describe("matchingTotpStep", () => {
	const secret = base32Encode(RFC_SECRET)
	const now = 1_700_000_000_000
	const step = totpStepAt(now)
	const codeFor = (offset: number) => hotp(RFC_SECRET, step + offset)

	it("accepts the current code and tolerates one step of clock drift", () => {
		expect(matchingTotpStep(secret, codeFor(0), now, null)).toBe(step)
		expect(matchingTotpStep(secret, codeFor(-1), now, null)).toBe(step - 1)
		expect(matchingTotpStep(secret, codeFor(1), now, null)).toBe(step + 1)
	})

	it("rejects codes outside the drift window", () => {
		expect(matchingTotpStep(secret, codeFor(-3), now, null)).toBeNull()
	})

	it("refuses to accept the same code twice", () => {
		expect(matchingTotpStep(secret, codeFor(0), now, step)).toBeNull()
	})

	it("rejects malformed input", () => {
		expect(matchingTotpStep(secret, "12ab56", now, null)).toBeNull()
	})
})

describe("otpauthUri", () => {
	it("carries the issuer, account and secret", () => {
		const uri = otpauthUri("Sculpt", "ada@example.com", "ABC")
		expect(uri).toMatch(/^otpauth:\/\/totp\/Sculpt%3Aada%40example\.com\?/)
		expect(uri).toContain("secret=ABC")
		expect(uri).toContain("issuer=Sculpt")
	})
})
