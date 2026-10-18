import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/prisma", () => ({ prisma: {} }))
vi.mock("./grants.service", () => ({ revokeGrantsOfClient: vi.fn() }))

import { Request } from "express"
import { presentsMcpServiceCredentials } from "./clients.service"

const SECRET = "a-shared-secret-that-is-long-enough-for-tests"

const basic = (id: string, secret: string) =>
	({
		headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
		body: {},
	}) as unknown as Request

describe("presentsMcpServiceCredentials", () => {
	beforeEach(() => vi.stubEnv("MCP_CLIENT_SECRET", SECRET))
	afterEach(() => vi.unstubAllEnvs())

	it("trusts only callers that prove they are the MCP service", () => {
		expect(presentsMcpServiceCredentials(basic("sculpt-mcp", SECRET))).toBe(true)
	})

	it("does not trust a caller that merely claims the MCP service's client id", () => {
		expect(presentsMcpServiceCredentials(basic("sculpt-mcp", "guess"))).toBe(false)
		expect(
			presentsMcpServiceCredentials({ headers: {}, body: { client_id: "sculpt-mcp" } } as unknown as Request)
		).toBe(false)
	})

	it("treats a malformed authorization header as untrusted instead of failing", () => {
		expect(
			presentsMcpServiceCredentials({
				headers: { authorization: `Basic ${Buffer.from("no-separator").toString("base64")}` },
				body: {},
			} as unknown as Request)
		).toBe(false)
	})
})
