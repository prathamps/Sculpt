import { describe, expect, it } from "vitest"
import { SESSION_AUTH, authAllowsScope, delegationOf } from "./request-auth"
import { withDelegation } from "../modules/audit/audit.service"

const viaApp = {
	method: "oauth" as const,
	scopes: new Set(["sculpt:read"]),
	clientId: "client-1",
	grantId: "grant-1",
	tokenId: "jti-1",
	actorClientId: "sculpt-mcp",
}

describe("request auth", () => {
	it("records nothing extra for a person acting in the browser", () => {
		expect(delegationOf(SESSION_AUTH)).toBeNull()
		expect(authAllowsScope(SESSION_AUTH, "sculpt:manage")).toBe(true)
	})

	it("names the app, grant, token and acting service for delegated requests", () => {
		expect(delegationOf(viaApp)).toEqual({
			via: "oauth",
			clientId: "client-1",
			grantId: "grant-1",
			tokenId: "jti-1",
			actingThrough: "sculpt-mcp",
		})
		expect(authAllowsScope(viaApp, "sculpt:manage")).toBe(false)
	})
})

describe("withDelegation", () => {
	const delegation = delegationOf(viaApp)

	it("adds the delegation to object metadata without losing fields", () => {
		expect(withDelegation({ name: "x" }, delegation)).toEqual({ name: "x", delegation })
	})

	it("creates metadata when an entry had none", () => {
		expect(withDelegation(undefined, delegation)).toEqual({ delegation })
	})

	it("leaves metadata untouched for undelegated requests", () => {
		expect(withDelegation({ name: "x" }, null)).toEqual({ name: "x" })
	})
})
