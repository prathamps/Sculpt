import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { isAllowedOrigin } from "./cors"

describe("isAllowedOrigin", () => {
	const originalFrontend = process.env.FRONTEND_URL
	const originalSuffixes = process.env.CORS_ALLOWED_HOST_SUFFIXES
	const originalNodeEnv = process.env.NODE_ENV

	beforeEach(() => {
		process.env.FRONTEND_URL = "https://sculpt.example.com"
		delete process.env.CORS_ALLOWED_HOST_SUFFIXES
		process.env.NODE_ENV = "test"
	})

	afterEach(() => {
		process.env.FRONTEND_URL = originalFrontend
		process.env.CORS_ALLOWED_HOST_SUFFIXES = originalSuffixes
		process.env.NODE_ENV = originalNodeEnv
	})

	it("allows requests with no origin (curl, same-origin, server-to-server)", () => {
		expect(isAllowedOrigin(undefined)).toBe(true)
	})

	it("allows localhost outside production", () => {
		expect(isAllowedOrigin("http://localhost:3000")).toBe(true)
		expect(isAllowedOrigin("http://127.0.0.1:8080")).toBe(true)
	})

	it("stops trusting localhost in production", () => {
		process.env.NODE_ENV = "production"

		expect(isAllowedOrigin("http://localhost:3000")).toBe(false)
		expect(isAllowedOrigin("http://127.0.0.1:8080")).toBe(false)
	})

	it("allows the configured frontend host", () => {
		expect(isAllowedOrigin("https://sculpt.example.com")).toBe(true)
	})

	it("rejects platform preview domains unless they are opted into explicitly", () => {
		expect(isAllowedOrigin("https://sculpt-io.vercel.app")).toBe(false)

		process.env.CORS_ALLOWED_HOST_SUFFIXES = "vercel.app"

		expect(isAllowedOrigin("https://sculpt-io.vercel.app")).toBe(true)
	})

	it("anchors opted-in suffixes at a dot boundary", () => {
		process.env.CORS_ALLOWED_HOST_SUFFIXES = "vercel.app"

		expect(isAllowedOrigin("https://vercel.app.evil.com")).toBe(false)
		expect(isAllowedOrigin("https://evil-vercel.app")).toBe(false)
		expect(isAllowedOrigin("https://vercel.app")).toBe(true)
	})

	it("rejects lookalike hosts that merely contain an allowed substring", () => {
		expect(isAllowedOrigin("https://sculpt-localhost.evil.com")).toBe(false)
		expect(isAllowedOrigin("https://sculpt.example.com.evil.com")).toBe(false)
	})

	it("rejects unrelated origins and unparseable values", () => {
		expect(isAllowedOrigin("https://evil.com")).toBe(false)
		expect(isAllowedOrigin("not-a-url")).toBe(false)
	})
})
