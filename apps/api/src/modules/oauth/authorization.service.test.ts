import { beforeEach, describe, expect, it, vi } from "vitest"

const clients = vi.hoisted(() => new Map<string, unknown>())
const consumedRequests = vi.hoisted(() => new Set<string>())

vi.mock("./clients.service", () => ({
	findClient: vi.fn(async (id: string) => clients.get(id) ?? null),
}))

vi.mock("./grants.service", () => ({
	findActiveGrant: vi.fn(async () => null),
	coversScopes: (granted: string[], requested: string[]) =>
		requested.every((scope) => granted.includes(scope)),
	hostOfRedirect: (uri: string) => new URL(uri).host,
	recordConsent: vi.fn(async () => ({ id: "grant-1" })),
}))

vi.mock("../../lib/prisma", async () => {
	const { Prisma } = await import("@prisma/client")
	return {
		prisma: {
			oAuthAuthorizationCode: { create: vi.fn(async () => ({})) },
			oAuthConsumedRequest: {
				findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
					consumedRequests.has(where.id) ? { id: where.id } : null
				),
				create: vi.fn(async ({ data }: { data: { id: string } }) => {
					if (consumedRequests.has(data.id)) {
						throw new Prisma.PrismaClientKnownRequestError("duplicate", {
							code: "P2002",
							clientVersion: "test",
						})
					}
					consumedRequests.add(data.id)
					return data
				}),
			},
		},
	}
})

import { beginAuthorization, decideConsent, readAuthorizationRequest } from "./authorization.service"
import { findActiveGrant } from "./grants.service"
import { describeConsent } from "./authorization.service"

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

const baseQuery = {
	response_type: "code",
	client_id: "client-1",
	redirect_uri: "https://agent.example/cb",
	code_challenge: CHALLENGE,
	code_challenge_method: "S256",
	state: "s1",
}

const user = { id: "user-1", tokenVersion: 0 } as never

const errorOf = (location: string) => new URL(location).searchParams.get("error")

describe("beginAuthorization", () => {
	beforeEach(() => {
		clients.clear()
		clients.set("client-1", {
			id: "client-1",
			kind: "DYNAMIC",
			name: "Agent",
			redirectUris: ["https://agent.example/cb"],
			grantTypes: ["authorization_code", "refresh_token"],
			tokenEndpointAuthMethod: "none",
			scope: null,
			disabled: false,
			verified: false,
			registeredAt: new Date("2026-10-17T00:00:00Z"),
		})
	})

	it("sends a valid request to the consent page with a signed handle", async () => {
		const outcome = await beginAuthorization(baseQuery)
		expect(outcome.kind).toBe("consent")
		const handle = new URL(outcome.location).searchParams.get("request")
		const request = readAuthorizationRequest(handle)
		expect(request).toMatchObject({
			clientId: "client-1",
			redirectUri: "https://agent.example/cb",
			codeChallenge: CHALLENGE,
			state: "s1",
			resource: "http://localhost:3002/mcp",
		})
		expect(request.requestId).toEqual(expect.any(String))
	})

	it("asks only for everyday permissions when the app names no scopes", async () => {
		const outcome = await beginAuthorization(baseQuery)
		const request = readAuthorizationRequest(new URL(outcome.location).searchParams.get("request"))

		expect(request.scopes).toEqual(["sculpt:read", "sculpt:feedback", "sculpt:content"])
	})

	it("gives every sign-in request its own identity", async () => {
		const first = readAuthorizationRequest(
			new URL((await beginAuthorization(baseQuery)).location).searchParams.get("request")
		)
		const second = readAuthorizationRequest(
			new URL((await beginAuthorization(baseQuery)).location).searchParams.get("request")
		)

		expect(first.requestId).not.toBe(second.requestId)
	})

	it("never redirects to an unregistered URI, even to report an error", async () => {
		const outcome = await beginAuthorization({ ...baseQuery, redirect_uri: "https://evil.example/cb" })
		expect(outcome.kind).toBe("fatal")
		expect(new URL(outcome.location).origin).toBe("http://localhost:3000")
	})

	it("stops at Sculpt when the client is unknown or disabled", async () => {
		expect((await beginAuthorization({ ...baseQuery, client_id: "nobody" })).kind).toBe("fatal")
		clients.set("client-1", { ...(clients.get("client-1") as object), disabled: true })
		expect((await beginAuthorization(baseQuery)).kind).toBe("fatal")
	})

	it("requires PKCE with S256", async () => {
		const missing = await beginAuthorization({ ...baseQuery, code_challenge: undefined as never })
		expect(errorOf(missing.location)).toBe("invalid_request")
		const plain = await beginAuthorization({ ...baseQuery, code_challenge_method: "plain" })
		expect(errorOf(plain.location)).toBe("invalid_request")
	})

	it("only supports the authorization code response type", async () => {
		const outcome = await beginAuthorization({ ...baseQuery, response_type: "token" })
		expect(errorOf(outcome.location)).toBe("unsupported_response_type")
	})

	it("rejects unknown scopes but tolerates standard OpenID ones", async () => {
		const unknown = await beginAuthorization({ ...baseQuery, scope: "sculpt:read admin:all" })
		expect(errorOf(unknown.location)).toBe("invalid_scope")
		const standard = await beginAuthorization({ ...baseQuery, scope: "openid offline_access sculpt:read" })
		expect(standard.kind).toBe("consent")
	})

	it("rejects resources Sculpt does not serve", async () => {
		const outcome = await beginAuthorization({ ...baseQuery, resource: "https://evil.example/mcp" })
		expect(errorOf(outcome.location)).toBe("invalid_target")
	})

	it("returns the state with every redirected error", async () => {
		const outcome = await beginAuthorization({ ...baseQuery, response_type: "token" })
		expect(new URL(outcome.location).searchParams.get("state")).toBe("s1")
	})
})

describe("consent", () => {
	beforeEach(() => consumedRequests.clear())

	const handle = async (): Promise<string> => {
		const outcome = await beginAuthorization({ ...baseQuery, scope: "sculpt:read sculpt:feedback" })
		return new URL(outcome.location).searchParams.get("request") ?? ""
	}

	it("asks again unless an earlier grant already covers every requested scope", async () => {
		expect((await describeConsent(await handle(), user)).autoApprove).toBe(false)

		vi.mocked(findActiveGrant).mockResolvedValueOnce({
			scopes: ["sculpt:read"],
			requestedScopes: ["sculpt:read"],
			tokenVersion: 0,
		} as never)
		expect((await describeConsent(await handle(), user)).autoApprove).toBe(false)

		vi.mocked(findActiveGrant).mockResolvedValueOnce({
			scopes: ["sculpt:read", "sculpt:feedback"],
			requestedScopes: [],
			tokenVersion: 0,
		} as never)
		expect((await describeConsent(await handle(), user)).autoApprove).toBe(true)
	})

	it("remembers permissions the person chose to leave off for the same request", async () => {
		vi.mocked(findActiveGrant).mockResolvedValueOnce({
			scopes: ["sculpt:read"],
			requestedScopes: ["sculpt:read", "sculpt:feedback"],
			tokenVersion: 0,
		} as never)

		const details = await describeConsent(await handle(), user)

		expect(details.autoApprove).toBe(true)
		expect(details.rememberedScopes).toEqual(["sculpt:read"])
	})

	it("asks again after the person's credentials change", async () => {
		vi.mocked(findActiveGrant).mockResolvedValueOnce({
			scopes: ["sculpt:read", "sculpt:feedback"],
			requestedScopes: [],
			tokenVersion: 0,
		} as never)

		const details = await describeConsent(await handle(), { id: "user-1", tokenVersion: 1 } as never)

		expect(details.autoApprove).toBe(false)
	})

	it("recommends only the everyday permissions on the consent screen", async () => {
		const outcome = await beginAuthorization({
			...baseQuery,
			scope: "sculpt:read sculpt:feedback sculpt:content sculpt:manage sculpt:account",
		})
		const details = await describeConsent(new URL(outcome.location).searchParams.get("request"), user)

		expect(details.recommendedScopes).toEqual(["sculpt:read", "sculpt:feedback", "sculpt:content"])
	})

	it("describes who the app really is: unverified, which host it sends you to, and when it registered", async () => {
		const details = await describeConsent(await handle(), user)

		expect(details.identity).toMatchObject({
			verified: false,
			identityHost: null,
			redirectHost: "agent.example",
			runsLocally: false,
			nameMatchesHost: true,
			registeredAt: "2026-10-17T00:00:00.000Z",
		})
	})

	it("accepts each sign-in request only once", async () => {
		const request = await handle()
		await decideConsent(request, user, { approved: true })

		await expect(decideConsent(request, user, { approved: true })).rejects.toThrow(/already used/)
		await expect(describeConsent(request, user)).rejects.toThrow(/already used/)
	})

	it("lets the person fix an empty selection without starting over", async () => {
		const request = await handle()

		await expect(decideConsent(request, user, { approved: true, scopes: [] })).rejects.toThrow(
			/at least one permission/
		)
		await expect(decideConsent(request, user, { approved: true })).resolves.toMatchObject({
			approved: true,
		})
	})

	it("redirects with access_denied when the person declines", async () => {
		const result = await decideConsent(await handle(), user, { approved: false })
		expect(errorOf(result.redirectTo)).toBe("access_denied")
	})

	it("lets the person approve fewer scopes than were requested, never more", async () => {
		const result = await decideConsent(await handle(), user, {
			approved: true,
			scopes: ["sculpt:read", "sculpt:manage"],
		})
		expect(result.scopes).toEqual(["sculpt:read"])
		expect(new URL(result.redirectTo).searchParams.get("code")).toMatch(/^sculpt_code_/)
	})

	it("rejects a tampered or expired request handle", () => {
		expect(() => readAuthorizationRequest("not-a-token")).toThrow(/expired or is invalid/)
	})
})
