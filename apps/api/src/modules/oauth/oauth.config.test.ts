import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mcpResource, mcpServiceSecretProblem, resolveResource } from "./oauth.config"

describe("resolveResource", () => {
	beforeEach(() => {
		vi.stubEnv("API_URL", "https://sculpt.example.com/api-origin")
		vi.stubEnv("MCP_RESOURCE_URL", "https://sculpt.example.com/mcp")
	})

	afterEach(() => vi.unstubAllEnvs())

	it("defaults to the MCP server when a client names no resource", () => {
		expect(resolveResource(undefined)).toBe("https://sculpt.example.com/mcp")
	})

	it("matches resources exactly, ignoring a trailing slash", () => {
		expect(resolveResource("https://sculpt.example.com/mcp/")).toBe("https://sculpt.example.com/mcp")
		expect(resolveResource("https://sculpt.example.com/api-origin")).toBe(
			"https://sculpt.example.com/api-origin"
		)
	})

	it("maps a bare origin to the MCP server rather than the API", () => {
		expect(resolveResource("https://sculpt.example.com")).toBe("https://sculpt.example.com/mcp")
	})

	it("refuses resources Sculpt does not serve", () => {
		expect(resolveResource("https://evil.example/mcp")).toBeNull()
		expect(resolveResource("https://sculpt.example.com/mcpx")).toBeNull()
		expect(resolveResource("not a url")).toBeNull()
	})
})

describe("MCP service configuration", () => {
	afterEach(() => vi.unstubAllEnvs())

	it("has no MCP resource in production until one is configured", () => {
		vi.stubEnv("NODE_ENV", "production")
		vi.stubEnv("MCP_RESOURCE_URL", "")
		expect(mcpResource()).toBeNull()
	})

	it("refuses to run the MCP resource in production without a strong service secret", () => {
		vi.stubEnv("NODE_ENV", "production")
		vi.stubEnv("MCP_RESOURCE_URL", "https://sculpt.example.com/mcp")
		vi.stubEnv("MCP_CLIENT_SECRET", "")
		expect(mcpServiceSecretProblem()).toMatch(/MCP_CLIENT_SECRET/)
		vi.stubEnv("MCP_CLIENT_SECRET", "short")
		expect(mcpServiceSecretProblem()).toMatch(/at least/)
		vi.stubEnv("MCP_CLIENT_SECRET", "x".repeat(48))
		expect(mcpServiceSecretProblem()).toBeNull()
	})
})
