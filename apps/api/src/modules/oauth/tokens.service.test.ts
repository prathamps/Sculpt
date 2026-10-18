import { beforeEach, describe, expect, it, vi } from "vitest"

interface Row {
	[key: string]: unknown
}

const store = vi.hoisted(() => ({
	keys: [] as Row[],
	codes: new Map<string, Row>(),
	refreshTokens: new Map<string, Row>(),
	users: new Map<string, Row>(),
	grants: new Map<string, Row>(),
}))

const withGrant = (row: Row | undefined) =>
	row ? { ...row, grant: store.grants.get(row.grantId as string) } : null

const claim = (map: Map<string, Row>, key: string) => {
	const row = map.get(key)
	if (!row || row.usedAt) return { count: 0 }
	row.usedAt = new Date()
	return { count: 1 }
}

vi.mock("../../lib/prisma", () => ({
	prisma: {
		oAuthSigningKey: {
			findFirst: vi.fn(async () => store.keys[store.keys.length - 1] ?? null),
			findUnique: vi.fn(async ({ where }: { where: { kid: string } }) =>
				store.keys.find((key) => key.kid === where.kid) ?? null
			),
			create: vi.fn(async ({ data }: { data: Row }) => {
				const row = { ...data, createdAt: new Date(), retiredAt: null }
				store.keys.push(row)
				return row
			}),
		},
		oAuthAuthorizationCode: {
			findUnique: vi.fn(async ({ where }: { where: { codeHash: string } }) =>
				withGrant(store.codes.get(where.codeHash))
			),
			updateMany: vi.fn(async ({ where }: { where: { codeHash: string } }) =>
				claim(store.codes, where.codeHash)
			),
		},
		oAuthRefreshToken: {
			findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
				withGrant(store.refreshTokens.get(where.tokenHash))
			),
			updateMany: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
				claim(store.refreshTokens, where.tokenHash)
			),
			create: vi.fn(async ({ data }: { data: Row }) => {
				store.refreshTokens.set(data.tokenHash as string, { ...data, usedAt: null })
				return data
			}),
		},
		user: {
			findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
				store.users.get(where.id) ?? null
			),
		},
		oAuthClient: { update: vi.fn(async () => ({})) },
	},
}))

vi.mock("./grants.service", () => ({
	liveGrant: vi.fn(async (id: string) => {
		const grant = store.grants.get(id)
		return grant && !grant.revokedAt ? grant : null
	}),
	revokeGrant: vi.fn(async (id: string) => {
		const grant = store.grants.get(id)
		if (grant) grant.revokedAt = new Date()
		return true
	}),
	noteGrantUsed: vi.fn(async () => undefined),
}))

vi.mock("../audit/audit.service", () => ({ recordAudit: vi.fn(async () => undefined) }))

import { handleTokenRequest } from "./tokens.service"
import { ResolvedClient, mcpServiceClient } from "./clients.service"
import { hashSecret } from "./secrets"
import { challengeForVerifier } from "./pkce"
import { forgetSigningKeys } from "./signing-keys.service"
import { verifyAccessToken } from "./access-tokens"
import { revokeGrant } from "./grants.service"
import { recordAudit } from "../audit/audit.service"
import { OAuthError } from "./oauth-errors"

const MCP = "http://localhost:3002/mcp"
const API = "http://localhost:3001"
const VERIFIER = "a".repeat(43)

const client: ResolvedClient = {
	id: "client-1",
	kind: "DYNAMIC",
	name: "Agent",
	redirectUris: ["https://agent.example/cb"],
	grantTypes: ["authorization_code", "refresh_token"],
	tokenEndpointAuthMethod: "none",
	secretHash: null,
	scope: null,
	clientUri: null,
	logoUri: null,
	disabled: false,
	verified: false,
	registeredAt: null,
}

const seedGrant = (overrides: Row = {}) => {
	store.users.set("user-1", { id: "user-1", tokenVersion: 0 })
	store.grants.set("grant-1", {
		id: "grant-1",
		userId: "user-1",
		clientId: client.id,
		scopes: ["sculpt:read", "sculpt:feedback"],
		resource: MCP,
		tokenVersion: 0,
		revokedAt: null,
		...overrides,
	})
}

const seedCode = (code: string, overrides: Row = {}) =>
	store.codes.set(hashSecret(code), {
		codeHash: hashSecret(code),
		grantId: "grant-1",
		redirectUri: "https://agent.example/cb",
		codeChallenge: challengeForVerifier(VERIFIER),
		scopes: ["sculpt:read", "sculpt:feedback"],
		resource: MCP,
		expiresAt: new Date(Date.now() + 60000),
		usedAt: null,
		...overrides,
	})

const failure = async (promise: Promise<unknown>): Promise<OAuthError> => {
	try {
		await promise
	} catch (error) {
		return error as OAuthError
	}
	throw new Error("expected the request to fail")
}

const codeRequest = (code: string, overrides: Row = {}) => ({
	grant_type: "authorization_code",
	code,
	code_verifier: VERIFIER,
	redirect_uri: "https://agent.example/cb",
	...overrides,
})

describe("token endpoint", () => {
	beforeEach(() => {
		store.keys.length = 0
		store.codes.clear()
		store.refreshTokens.clear()
		store.users.clear()
		store.grants.clear()
		forgetSigningKeys()
		vi.clearAllMocks()
		seedGrant()
	})

	it("exchanges a code for an audience-bound access token and a refresh token", async () => {
		seedCode("code-1")
		const tokens = await handleTokenRequest(client, codeRequest("code-1"))

		expect(tokens.refresh_token).toBeTruthy()
		expect(tokens.scope).toBe("sculpt:read sculpt:feedback")
		const claims = await verifyAccessToken(tokens.access_token, MCP)
		expect(claims).toMatchObject({ sub: "user-1", gid: "grant-1", client_id: "client-1" })
		expect(await verifyAccessToken(tokens.access_token, API)).toBeNull()
	})

	it("rejects a code presented with the wrong PKCE verifier", async () => {
		seedCode("code-1")
		const error = await failure(
			handleTokenRequest(client, codeRequest("code-1", { code_verifier: "b".repeat(43) }))
		)
		expect(error.error).toBe("invalid_grant")
	})

	it("rejects a code issued to a different client", async () => {
		seedCode("code-1")
		const error = await failure(
			handleTokenRequest({ ...client, id: "someone-else" }, codeRequest("code-1"))
		)
		expect(error.error).toBe("invalid_grant")
	})

	it("revokes the whole grant when a code is replayed", async () => {
		seedCode("code-1")
		await handleTokenRequest(client, codeRequest("code-1"))
		const error = await failure(handleTokenRequest(client, codeRequest("code-1")))

		expect(error.error).toBe("invalid_grant")
		expect(revokeGrant).toHaveBeenCalledWith("grant-1")
		expect(recordAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: "oauth.authorization_code_reused" })
		)
	})

	it("refuses to issue tokens once the person's credentials changed", async () => {
		seedCode("code-1")
		store.users.set("user-1", { id: "user-1", tokenVersion: 1 })
		const error = await failure(handleTokenRequest(client, codeRequest("code-1")))
		expect(error.error).toBe("invalid_grant")
	})

	it("rotates refresh tokens and revokes the grant when a spent one comes back", async () => {
		seedCode("code-1")
		const first = await handleTokenRequest(client, codeRequest("code-1"))
		const second = await handleTokenRequest(client, {
			grant_type: "refresh_token",
			refresh_token: first.refresh_token,
		})
		expect(second.refresh_token).not.toBe(first.refresh_token)

		const error = await failure(
			handleTokenRequest(client, { grant_type: "refresh_token", refresh_token: first.refresh_token })
		)
		expect(error.error).toBe("invalid_grant")
		expect(revokeGrant).toHaveBeenCalledWith("grant-1")
	})

	it("lets a refresh narrow scopes but never add them", async () => {
		seedCode("code-1")
		const first = await handleTokenRequest(client, codeRequest("code-1"))
		const narrowed = await handleTokenRequest(client, {
			grant_type: "refresh_token",
			refresh_token: first.refresh_token,
			scope: "sculpt:read",
		})
		expect(narrowed.scope).toBe("sculpt:read")

		const error = await failure(
			handleTokenRequest(client, {
				grant_type: "refresh_token",
				refresh_token: narrowed.refresh_token,
				scope: "sculpt:read sculpt:manage",
			})
		)
		expect(error.error).toBe("invalid_scope")
	})

	describe("token exchange", () => {
		const exchange = (subjectToken: string, overrides: Row = {}) => ({
			grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
			subject_token: subjectToken,
			subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
			resource: API,
			...overrides,
		})

		it("turns an MCP token into a short-lived API token that names the acting service", async () => {
			seedCode("code-1")
			const { access_token } = await handleTokenRequest(client, codeRequest("code-1"))
			const delegated = await handleTokenRequest(mcpServiceClient(), exchange(access_token))

			expect(delegated.expires_in).toBeLessThanOrEqual(300)
			const claims = await verifyAccessToken(delegated.access_token, API)
			expect(claims).toMatchObject({
				sub: "user-1",
				client_id: "client-1",
				act: { sub: "sculpt-mcp" },
			})
		})

		it("is reserved for the first-party MCP service", async () => {
			seedCode("code-1")
			const { access_token } = await handleTokenRequest(client, codeRequest("code-1"))
			const error = await failure(handleTokenRequest(client, exchange(access_token)))
			expect(error.error).toBe("unauthorized_client")
		})

		it("only accepts tokens that were minted for the MCP server", async () => {
			seedCode("code-1", { resource: API })
			store.grants.get("grant-1")!.resource = API
			const { access_token } = await handleTokenRequest(client, codeRequest("code-1"))
			const error = await failure(handleTokenRequest(mcpServiceClient(), exchange(access_token)))
			expect(error.error).toBe("invalid_grant")
		})

		it("refuses to exchange a token whose grant was revoked", async () => {
			seedCode("code-1")
			const { access_token } = await handleTokenRequest(client, codeRequest("code-1"))
			store.grants.get("grant-1")!.revokedAt = new Date()
			const error = await failure(handleTokenRequest(mcpServiceClient(), exchange(access_token)))
			expect(error.error).toBe("invalid_grant")
		})

		it("only exchanges into the Sculpt API audience", async () => {
			seedCode("code-1")
			const { access_token } = await handleTokenRequest(client, codeRequest("code-1"))
			const error = await failure(
				handleTokenRequest(mcpServiceClient(), exchange(access_token, { resource: MCP }))
			)
			expect(error.error).toBe("invalid_target")
		})
	})

	it("rejects grant types it does not support", async () => {
		const error = await failure(handleTokenRequest(client, { grant_type: "password" }))
		expect(error.error).toBe("unsupported_grant_type")
	})
})
