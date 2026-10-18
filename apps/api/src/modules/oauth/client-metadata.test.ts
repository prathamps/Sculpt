import { describe, expect, it } from "vitest"
import {
	displayName,
	parseClientRegistration,
	redirectMatches,
	redirectUriProblem,
} from "./client-metadata"
import { OAuthError } from "./oauth-errors"

const registrationError = (body: unknown): OAuthError | null => {
	try {
		parseClientRegistration(body)
		return null
	} catch (error) {
		return error as OAuthError
	}
}

describe("redirect URI rules", () => {
	it("accepts https, loopback http and private-use schemes", () => {
		expect(redirectUriProblem("https://claude.ai/api/mcp/auth_callback")).toBeNull()
		expect(redirectUriProblem("http://localhost:6274/oauth/callback")).toBeNull()
		expect(redirectUriProblem("http://127.0.0.1:33418/")).toBeNull()
		expect(redirectUriProblem("cursor://anysphere.cursor-retrieval/oauth/callback")).toBeNull()
	})

	it("refuses plain http on a network host", () => {
		expect(redirectUriProblem("http://example.com/callback")).not.toBeNull()
	})

	it("refuses script-capable and fragment-bearing URIs", () => {
		expect(redirectUriProblem("javascript:alert(1)")).not.toBeNull()
		expect(redirectUriProblem("data:text/html,hi")).not.toBeNull()
		expect(redirectUriProblem("https://example.com/cb#frag")).not.toBeNull()
		expect(redirectUriProblem("https://user:pass@example.com/cb")).not.toBeNull()
	})

	it("matches registered URIs exactly", () => {
		expect(redirectMatches("https://a.example/cb", "https://a.example/cb")).toBe(true)
		expect(redirectMatches("https://a.example/cb", "https://a.example/cb2")).toBe(false)
		expect(redirectMatches("https://a.example/cb", "https://a.example:8443/cb")).toBe(false)
	})

	it("lets native apps pick any loopback port, as RFC 8252 requires", () => {
		expect(redirectMatches("http://127.0.0.1:1000/cb", "http://127.0.0.1:54321/cb")).toBe(true)
		expect(redirectMatches("http://127.0.0.1:1000/cb", "http://127.0.0.1:54321/other")).toBe(false)
		expect(redirectMatches("http://localhost/cb", "http://127.0.0.1:5/cb")).toBe(false)
	})
})

describe("parseClientRegistration", () => {
	it("defaults to a public client using the code and refresh grants", () => {
		const registration = parseClientRegistration({
			client_name: "Claude",
			redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
		})
		expect(registration).toMatchObject({
			name: "Claude",
			grantTypes: ["authorization_code", "refresh_token"],
			tokenEndpointAuthMethod: "none",
		})
	})

	it("requires at least one redirect URI", () => {
		expect(registrationError({ client_name: "x", redirect_uris: [] })?.error).toBe(
			"invalid_client_metadata"
		)
	})

	it("reports a bad redirect URI with its own error code", () => {
		expect(registrationError({ redirect_uris: ["http://evil.example/cb"] })?.error).toBe(
			"invalid_redirect_uri"
		)
	})

	it("refuses grant types Sculpt does not issue to registered clients", () => {
		expect(
			registrationError({
				redirect_uris: ["https://a.example/cb"],
				grant_types: ["client_credentials"],
			})?.error
		).toBe("invalid_client_metadata")
		expect(
			registrationError({
				redirect_uris: ["https://a.example/cb"],
				grant_types: ["urn:ietf:params:oauth:grant-type:token-exchange"],
			})?.error
		).toBe("invalid_client_metadata")
	})

	it("refuses implicit and hybrid response types", () => {
		expect(
			registrationError({ redirect_uris: ["https://a.example/cb"], response_types: ["token"] })
				?.error
		).toBe("invalid_client_metadata")
	})

	it("keeps only scopes Sculpt knows about", () => {
		expect(
			parseClientRegistration({
				redirect_uris: ["https://a.example/cb"],
				scope: "sculpt:read openid",
			}).scope
		).toBe("sculpt:read")
	})

	it("cleans control characters out of the display name and falls back when empty", () => {
		expect(displayName("Evil\u0000‮ App")).toBe("Evil‮ App")
		expect(displayName("   ")).toBe("Unnamed app")
	})
})
