import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { ConfigurationError, assertStartupConfiguration, jwtSecret } from "./config"

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
