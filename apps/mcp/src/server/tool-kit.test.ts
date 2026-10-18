import { describe, expect, it } from "vitest"
import { explainFailure, structuredContentOf, successResult } from "./tool-kit.js"
import { SculptApiError } from "../sculpt/api-client.js"
import { TokenRejectedError } from "../auth/delegation.js"
import { loadConfig, ConfigurationError } from "../config.js"
import { bearerTokenFrom } from "../auth/caller.js"
import { protectedResourceMetadataPath } from "../auth/protected-resource.js"

describe("tool results", () => {
	it("wraps arrays so structured content is always an object", () => {
		expect(structuredContentOf([1, 2])).toEqual({ result: [1, 2] })
		expect(structuredContentOf({ id: "a" })).toEqual({ id: "a" })
		expect(structuredContentOf(undefined)).toBeUndefined()
	})

	it("returns a summary and the data as text alongside structured content", () => {
		const result = successResult({ summary: "Created.", data: { id: "p1" } })
		expect(result.content.map((block) => block.type)).toEqual(["text", "text"])
		expect(result.structuredContent).toEqual({ id: "p1" })
	})
})

describe("explainFailure", () => {
	it("tells the assistant which permission is missing and how to get it", () => {
		const message = explainFailure(new SculptApiError(403, "nope", "insufficient_scope", "sculpt:manage"))
		expect(message).toContain("sculpt:manage")
		expect(message).toMatch(/reconnect/i)
	})

	it("tells the assistant to reconnect when the grant was revoked", () => {
		expect(explainFailure(new TokenRejectedError("revoked"))).toMatch(/reconnect/i)
	})

	it("passes Sculpt's own explanation through", () => {
		expect(explainFailure(new SculptApiError(400, "Project name cannot be empty"))).toContain(
			"Project name cannot be empty"
		)
	})

	it("never leaks unexpected internal errors", () => {
		expect(explainFailure(new Error("ECONNRESET at 10.0.0.4"))).not.toContain("10.0.0.4")
	})
})

describe("configuration", () => {
	it("refuses to run in production without a resource URL and a strong secret", () => {
		expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(ConfigurationError)
		expect(() =>
			loadConfig({ NODE_ENV: "production", MCP_RESOURCE_URL: "https://m.example/mcp", MCP_CLIENT_SECRET: "short" })
		).toThrow(ConfigurationError)
		expect(
			loadConfig({
				NODE_ENV: "production",
				MCP_RESOURCE_URL: "https://m.example/mcp/",
				MCP_CLIENT_SECRET: "x".repeat(48),
			}).resource
		).toBe("https://m.example/mcp")
	})

	it("defaults the issuer to the API URL", () => {
		expect(loadConfig({ SCULPT_API_URL: "http://api:3001/" }).issuer).toBe("http://api:3001")
	})
})

describe("auth helpers", () => {
	it("reads bearer tokens case-insensitively", () => {
		expect(bearerTokenFrom("bearer abc.def")).toBe("abc.def")
		expect(bearerTokenFrom("Basic abc")).toBeNull()
		expect(bearerTokenFrom(undefined)).toBeNull()
	})

	it("inserts the resource path into the metadata location as RFC 9728 describes", () => {
		expect(protectedResourceMetadataPath("https://a.example/mcp")).toBe("/.well-known/oauth-protected-resource/mcp")
		expect(protectedResourceMetadataPath("https://a.example/")).toBe("/.well-known/oauth-protected-resource")
	})
})
