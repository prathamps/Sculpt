import { describe, expect, it, afterEach } from "vitest"
import { randomBytes } from "crypto"
import { openSecret, sealSecret } from "./secret-box"

afterEach(() => {
	delete process.env.MFA_ENCRYPTION_KEY
})

describe("secret box", () => {
	it("round-trips a secret without storing it in clear text", () => {
		const sealed = sealSecret("JBSWY3DPEHPK3PXP")

		expect(sealed).not.toContain("JBSWY3DPEHPK3PXP")
		expect(openSecret(sealed)).toBe("JBSWY3DPEHPK3PXP")
	})

	it("uses a fresh nonce for every seal", () => {
		expect(sealSecret("same")).not.toBe(sealSecret("same"))
	})

	it("detects tampering", () => {
		const [version, iv, tag, ciphertext] = sealSecret("secret").split(":")
		const flipped = Buffer.from(ciphertext!, "base64")
		flipped[0] = flipped[0]! ^ 1
		expect(() =>
			openSecret([version, iv, tag, flipped.toString("base64")].join(":"))
		).toThrow()
	})

	it("uses a dedicated key when one is configured", () => {
		process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64")
		const sealed = sealSecret("secret")
		process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64")

		expect(() => openSecret(sealed)).toThrow()
	})
})
