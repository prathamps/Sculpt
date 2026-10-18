import { describe, expect, it, vi } from "vitest"
import { createCallerResolver } from "./caller.js"
import { AuthorizationServerError, Delegation, TokenRejectedError } from "./delegation.js"
import { AccessTokenVerifier } from "./token-verifier.js"

const verifier: AccessTokenVerifier = async (token) =>
	token === "valid-jwt"
		? {
				subject: "user-1",
				scopes: new Set(["sculpt:read"]),
				clientId: "client-1",
				expiresAt: Date.now() + 60000,
			}
		: null

const delegationThat = (exchange: () => Promise<string>): Delegation => ({
	apiTokenFor: vi.fn(exchange),
	introspectPersonalToken: vi.fn(async () => null),
	forget: vi.fn(),
	clear: vi.fn(),
})

describe("createCallerResolver", () => {
	it("accepts an OAuth token only when Sculpt still honours the connection behind it", async () => {
		const resolver = createCallerResolver(verifier, delegationThat(async () => "api-token"))

		expect(await resolver.resolve("valid-jwt")).toMatchObject({ userId: "user-1", via: "oauth" })
	})

	it("treats a revoked connection as an invalid token so the client signs in again", async () => {
		const resolver = createCallerResolver(
			verifier,
			delegationThat(async () => {
				throw new TokenRejectedError("revoked")
			})
		)

		expect(await resolver.resolve("valid-jwt")).toBeNull()
	})

	it("reports an unreachable authorization server instead of blaming the token", async () => {
		const resolver = createCallerResolver(
			verifier,
			delegationThat(async () => {
				throw new AuthorizationServerError("down")
			})
		)

		await expect(resolver.resolve("valid-jwt")).rejects.toBeInstanceOf(AuthorizationServerError)
	})

	it("forgets the cached API token when Sculpt starts refusing it", async () => {
		const delegation = delegationThat(async () => "api-token")
		const caller = await createCallerResolver(verifier, delegation).resolve("valid-jwt")

		caller?.forgetApiToken()

		expect(delegation.forget).toHaveBeenCalledWith("valid-jwt")
	})
})
