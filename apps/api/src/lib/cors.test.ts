import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { isAllowedOrigin } from "./cors"

describe("isAllowedOrigin", () => {
	const originalFrontend = process.env.FRONTEND_URL

	beforeEach(() => {
		process.env.FRONTEND_URL = "https://sculpt.example.com"
	})

	afterEach(() => {
		process.env.FRONTEND_URL = originalFrontend
	})

	it("allows requests with no origin (curl, same-origin, server-to-server)", () => {
		expect(isAllowedOrigin(undefined)).toBe(true)
	})

	it("allows localhost on any port", () => {
		expect(isAllowedOrigin("http://localhost:3000")).toBe(true)
		expect(isAllowedOrigin("http://127.0.0.1:8080")).toBe(true)
	})

	it("allows vercel.app deployments", () => {
		expect(isAllowedOrigin("https://sculpt-io.vercel.app")).toBe(true)
	})

	it("allows the configured frontend host", () => {
		expect(isAllowedOrigin("https://sculpt.example.com")).toBe(true)
	})

	it("rejects lookalike hosts that merely contain an allowed substring", () => {
		expect(isAllowedOrigin("https://vercel.app.evil.com")).toBe(false)
		expect(isAllowedOrigin("https://sculpt-localhost.evil.com")).toBe(false)
		expect(isAllowedOrigin("https://sculpt.example.com.evil.com")).toBe(false)
	})

	it("rejects unrelated origins and unparseable values", () => {
		expect(isAllowedOrigin("https://evil.com")).toBe(false)
		expect(isAllowedOrigin("not-a-url")).toBe(false)
	})
})
