import { AddressInfo } from "net"
import http from "http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMcpApp } from "./app.js"
import { loadConfig } from "./config.js"
import { Caller, CallerResolver } from "./auth/caller.js"
import { Scope } from "./scopes.js"

const config = loadConfig({
	SCULPT_API_URL: "http://127.0.0.1:9",
	MCP_RESOURCE_URL: "https://mcp.sculpt.test/mcp",
	OAUTH_ISSUER: "https://sculpt.test",
})

const callerWith = (scopes: Scope[]): Caller => ({
	userId: "user-1",
	scopes: new Set(scopes),
	clientId: "client-1",
	via: "oauth",
	apiToken: async () => "api-token",
	forgetApiToken: () => undefined,
})

const resolver: CallerResolver = {
	resolve: async (token) => {
		if (token === "read-token") return callerWith(["sculpt:read"])
		if (token === "full-token") {
			return callerWith(["sculpt:read", "sculpt:feedback", "sculpt:content", "sculpt:manage", "sculpt:account"])
		}
		return null
	},
}

let server: http.Server
let base: string

beforeAll(async () => {
	server = http.createServer(createMcpApp({ config, resolver }))
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const rpc = (token: string | null, method: string, params: unknown = {}) =>
	fetch(`${base}/mcp`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	})

const INITIALIZE = {
	protocolVersion: "2025-11-25",
	capabilities: {},
	clientInfo: { name: "test", version: "1.0.0" },
}

describe("MCP HTTP endpoint", () => {
	it("publishes protected resource metadata at the path-specific and root locations", async () => {
		for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
			const metadata = await (await fetch(`${base}${path}`)).json()
			expect(metadata).toMatchObject({
				resource: "https://mcp.sculpt.test/mcp",
				authorization_servers: ["https://sculpt.test"],
			})
		}
	})

	it("answers an unauthenticated request with a challenge that starts OAuth discovery", async () => {
		const response = await rpc(null, "initialize", INITIALIZE)
		expect(response.status).toBe(401)
		const challenge = response.headers.get("www-authenticate") ?? ""
		expect(challenge).toContain(
			'resource_metadata="https://mcp.sculpt.test/.well-known/oauth-protected-resource/mcp"'
		)
		expect(challenge).toContain('scope="sculpt:read')
	})

	it("rejects an unknown token as invalid_token", async () => {
		const response = await rpc("forged", "initialize", INITIALIZE)
		expect(response.status).toBe(401)
		expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"')
	})

	it("lets browser-based clients read the challenge across origins", async () => {
		const response = await fetch(`${base}/mcp`, { method: "OPTIONS" })
		expect(response.status).toBe(204)
		expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate")
	})

	it("initializes with Sculpt's identity and instructions", async () => {
		const body = await (await rpc("read-token", "initialize", INITIALIZE)).json()
		expect(body.result.serverInfo.name).toBe("sculpt")
		expect(body.result.instructions).toContain("versionIds")
	})

	it("lists only the tools the connection's scopes allow", async () => {
		const readOnly = await (await rpc("read-token", "tools/list")).json()
		const readNames = readOnly.result.tools.map((tool: { name: string }) => tool.name)
		expect(readNames).toContain("view_version")
		expect(readNames).not.toContain("add_comment")
		expect(readNames).not.toContain("delete_project")

		const full = await (await rpc("full-token", "tools/list")).json()
		expect(full.result.tools.length).toBeGreaterThan(readNames.length)
		expect(full.result.tools.map((tool: { name: string }) => tool.name)).toContain("delete_project")
	})

	it("refuses calls from web origins it does not trust, which stops DNS rebinding", async () => {
		const call = (origin: string) =>
			fetch(`${base}/mcp`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
					Authorization: "Bearer read-token",
					Origin: origin,
				},
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: INITIALIZE }),
			})

		expect((await call("https://evil.example")).status).toBe(403)
		expect((await call("http://localhost:3000")).status).toBe(200)
		expect((await call("https://mcp.sculpt.test")).status).toBe(200)
	})

	it("checks the token before reading the request body", async () => {
		const response = await fetch(`${base}/mcp`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{ not json",
		})

		expect(response.status).toBe(401)
	})

	it("is stateless, so GET streams are refused", async () => {
		const response = await fetch(`${base}/mcp`, { headers: { Authorization: "Bearer read-token" } })
		expect(response.status).toBe(405)
	})
})
