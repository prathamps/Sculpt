import { describe, expect, it } from "vitest"
import {
	SCOPES,
	formatScopes,
	narrowScopes,
	parseScopeString,
	scopeForMinimumRole,
} from "./scopes"

describe("scopes", () => {
	it("maps each project role tier to exactly one scope", () => {
		expect(scopeForMinimumRole("VIEWER")).toBe("sculpt:read")
		expect(scopeForMinimumRole("MEMBER")).toBe("sculpt:feedback")
		expect(scopeForMinimumRole("EDITOR")).toBe("sculpt:content")
		expect(scopeForMinimumRole("OWNER")).toBe("sculpt:manage")
	})

	it("separates known scopes from unknown ones and drops duplicates", () => {
		expect(parseScopeString("sculpt:read  openid sculpt:read sculpt:content")).toEqual({
			scopes: ["sculpt:read", "sculpt:content"],
			unknown: ["openid"],
		})
	})

	it("treats a missing scope string as no scopes", () => {
		expect(parseScopeString(undefined)).toEqual({ scopes: [], unknown: [] })
	})

	it("formats scopes in canonical order", () => {
		expect(formatScopes(["sculpt:manage", "sculpt:read"])).toBe("sculpt:read sculpt:manage")
	})

	it("never widens a grant when narrowing", () => {
		expect(narrowScopes(["sculpt:read"], [...SCOPES])).toEqual(["sculpt:read"])
		expect(narrowScopes(["sculpt:read", "sculpt:content"], ["sculpt:content"])).toEqual([
			"sculpt:content",
		])
	})
})
