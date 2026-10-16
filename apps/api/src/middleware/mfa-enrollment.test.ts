import { describe, expect, it, afterEach } from "vitest"
import { mustEnrollBeforeContinuing } from "./mfa-enrollment"

afterEach(() => {
	delete process.env.MFA_REQUIRED
})

const request = (originalUrl: string) => ({ method: "GET", originalUrl })

describe("mustEnrollBeforeContinuing", () => {
	it("lets everyone through when the organisation does not require two-factor", () => {
		expect(mustEnrollBeforeContinuing(request("/api/projects"), { totpEnabledAt: null })).toBe(false)
	})

	it("blocks project data for people who have not enrolled once it is required", () => {
		process.env.MFA_REQUIRED = "true"

		expect(mustEnrollBeforeContinuing(request("/api/projects"), { totpEnabledAt: null })).toBe(true)
	})

	it("keeps enrollment, profile and sign-out reachable so people can comply", () => {
		process.env.MFA_REQUIRED = "true"
		const unenrolled = { totpEnabledAt: null }

		expect(mustEnrollBeforeContinuing(request("/api/users/me/mfa/setup"), unenrolled)).toBe(false)
		expect(mustEnrollBeforeContinuing(request("/api/users/me"), unenrolled)).toBe(false)
		expect(mustEnrollBeforeContinuing(request("/api/auth/logout"), unenrolled)).toBe(false)
		expect(mustEnrollBeforeContinuing(request("/api/users/me/export"), unenrolled)).toBe(true)
	})

	it("never blocks someone who already uses two-factor", () => {
		process.env.MFA_REQUIRED = "true"

		expect(
			mustEnrollBeforeContinuing(request("/api/projects"), { totpEnabledAt: new Date() })
		).toBe(false)
	})
})
