import { describe, expect, it } from "vitest"
import { challengeForVerifier, isWellFormedPkceValue, verifierMatchesChallenge } from "./pkce"

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

describe("PKCE", () => {
	it("computes the RFC 7636 example challenge", () => {
		expect(challengeForVerifier(VERIFIER)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
	})

	it("accepts the verifier that produced the challenge", () => {
		expect(verifierMatchesChallenge(VERIFIER, challengeForVerifier(VERIFIER))).toBe(true)
	})

	it("rejects any other verifier", () => {
		const other = `${VERIFIER.slice(0, -1)}A`
		expect(verifierMatchesChallenge(other, challengeForVerifier(VERIFIER))).toBe(false)
	})

	it("rejects verifiers outside the 43-128 unreserved-character range", () => {
		expect(isWellFormedPkceValue("short")).toBe(false)
		expect(isWellFormedPkceValue("a".repeat(129))).toBe(false)
		expect(isWellFormedPkceValue(`${"a".repeat(42)}!`)).toBe(false)
		expect(verifierMatchesChallenge(undefined, "x")).toBe(false)
	})
})
