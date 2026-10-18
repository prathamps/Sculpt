import { describe, expect, it } from "vitest"
import { identityHostOf, nameMatchesHost, redirectRunsLocally } from "./client-identity"

describe("client identity", () => {
	it("matches an app name against the host it really uses", () => {
		expect(nameMatchesHost("Claude", "claude.ai")).toBe(true)
		expect(nameMatchesHost("ChatGPT", "chatgpt.com")).toBe(true)
		expect(nameMatchesHost("Claude", "claude-login.evil.example")).toBe(true)
		expect(nameMatchesHost("Claude", "evil.example")).toBe(false)
	})

	it("ignores generic words that say nothing about who the app is", () => {
		expect(nameMatchesHost("MCP Client App", "app.example")).toBe(false)
	})

	it("treats loopback and custom-scheme redirects as apps running on the person's computer", () => {
		expect(redirectRunsLocally("http://127.0.0.1:33418/callback")).toBe(true)
		expect(redirectRunsLocally("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true)
		expect(redirectRunsLocally("https://claude.ai/api/mcp/auth_callback")).toBe(false)
	})

	it("takes a metadata-document client's identity from the URL it is published at", () => {
		expect(identityHostOf({ id: "https://claude.ai/oauth/client.json", kind: "METADATA_DOCUMENT" })).toBe(
			"claude.ai"
		)
		expect(identityHostOf({ id: "sculpt_client_abc", kind: "DYNAMIC" })).toBeNull()
	})
})
