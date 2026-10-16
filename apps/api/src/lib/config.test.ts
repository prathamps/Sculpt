import { describe, expect, it, beforeEach, afterEach } from "vitest"
import {
	ConfigurationError,
	assertStartupConfiguration,
	jwtSecret,
	startupWarnings,
	usesSecureCookies,
} from "./config"

const STRONG_SECRET = "j8Kd9wQm2vXpL5rT7yNb4cZa6sHf3gEu1oPiRlWnMqYtBxCv"

describe("jwtSecret", () => {
	const originalEnv = { ...process.env }

	beforeEach(() => {
		delete process.env.JWT_SECRET
		process.env.NODE_ENV = "test"
	})

	afterEach(() => {
		process.env = { ...originalEnv }
	})

	it("falls back to a development secret outside production", () => {
		expect(jwtSecret()).toContain("development")
	})

	it("refuses to start in production without a secret", () => {
		process.env.NODE_ENV = "production"

		expect(() => jwtSecret()).toThrow(ConfigurationError)
	})

	it("refuses the placeholder secret from .env.example in production", () => {
		process.env.NODE_ENV = "production"
		process.env.JWT_SECRET = "your_jwt_secret"

		expect(() => jwtSecret()).toThrow(/placeholder/i)
	})

	it("refuses a short secret in production", () => {
		process.env.NODE_ENV = "production"
		process.env.JWT_SECRET = "too-short"

		expect(() => jwtSecret()).toThrow(/at least 32/i)
	})

	it("accepts a strong secret in production", () => {
		process.env.NODE_ENV = "production"
		process.env.JWT_SECRET = STRONG_SECRET

		expect(jwtSecret()).toBe(STRONG_SECRET)
	})
})

describe("assertStartupConfiguration", () => {
	const originalEnv = { ...process.env }

	afterEach(() => {
		process.env = { ...originalEnv }
	})

	it("requires FRONTEND_URL in production so origins can be allowlisted", () => {
		process.env.NODE_ENV = "production"
		process.env.JWT_SECRET = STRONG_SECRET
		delete process.env.FRONTEND_URL

		expect(() => assertStartupConfiguration()).toThrow(/FRONTEND_URL/)
	})

	it("passes with a complete production configuration", () => {
		process.env.NODE_ENV = "production"
		process.env.JWT_SECRET = STRONG_SECRET
		process.env.FRONTEND_URL = "https://sculpt.example.com"

		expect(() => assertStartupConfiguration()).not.toThrow()
	})
})

describe("usesSecureCookies", () => {
	const originalEnv = { ...process.env }

	afterEach(() => {
		process.env = { ...originalEnv }
	})

	it("keeps cookies Secure for an HTTPS deployment", () => {
		process.env.NODE_ENV = "production"
		process.env.FRONTEND_URL = "https://sculpt.example.com"
		process.env.MFA_ENCRYPTION_KEY = "a".repeat(44)

		expect(usesSecureCookies()).toBe(true)
		expect(startupWarnings()).toEqual([])
	})

	it("drops the Secure flag on a plain-HTTP LAN deployment so sign-in still works, and warns", () => {
		process.env.NODE_ENV = "production"
		process.env.FRONTEND_URL = "http://192.168.1.20:3000"

		expect(usesSecureCookies()).toBe(false)
		expect(startupWarnings()).toEqual(
			expect.arrayContaining([expect.stringMatching(/plain HTTP/)])
		)
	})

	it("refuses to start on plain HTTP over the network unless the operator accepts the risk", () => {
		process.env.NODE_ENV = "production"
		process.env.JWT_SECRET = STRONG_SECRET
		process.env.FRONTEND_URL = "http://192.168.1.20:3000"
		delete process.env.ALLOW_INSECURE_HTTP

		expect(() => assertStartupConfiguration()).toThrow(/ALLOW_INSECURE_HTTP/)

		process.env.ALLOW_INSECURE_HTTP = "true"
		expect(() => assertStartupConfiguration()).not.toThrow()
	})

	it("allows plain HTTP on the local machine without opting in", () => {
		process.env.NODE_ENV = "production"
		process.env.JWT_SECRET = STRONG_SECRET
		process.env.FRONTEND_URL = "http://localhost:3000"
		delete process.env.ALLOW_INSECURE_HTTP

		expect(() => assertStartupConfiguration()).not.toThrow()
	})

	it("warns when two-factor secrets would depend on the session signing key", () => {
		process.env.NODE_ENV = "production"
		process.env.FRONTEND_URL = "https://sculpt.example.com"
		delete process.env.MFA_ENCRYPTION_KEY

		expect(startupWarnings()).toEqual([expect.stringMatching(/MFA_ENCRYPTION_KEY/)])
	})

	it("never marks cookies Secure in development", () => {
		process.env.NODE_ENV = "development"
		process.env.FRONTEND_URL = "https://localhost:3000"

		expect(usesSecureCookies()).toBe(false)
	})
})
