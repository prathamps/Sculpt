import { describe, expect, it } from "vitest"
import { roleMeets } from "./access"

describe("roleMeets", () => {
	it("grants a role everything its lower ranks grant", () => {
		expect(roleMeets("OWNER", "VIEWER")).toBe(true)
		expect(roleMeets("OWNER", "EDITOR")).toBe(true)
		expect(roleMeets("EDITOR", "MEMBER")).toBe(true)
		expect(roleMeets("MEMBER", "VIEWER")).toBe(true)
	})

	it("denies actions above a role's rank", () => {
		expect(roleMeets("VIEWER", "MEMBER")).toBe(false)
		expect(roleMeets("MEMBER", "EDITOR")).toBe(false)
		expect(roleMeets("EDITOR", "OWNER")).toBe(false)
	})

	it("treats a non-member (null role) as denied", () => {
		expect(roleMeets(null, "VIEWER")).toBe(false)
	})

	it("allows a role to meet its own rank", () => {
		expect(roleMeets("MEMBER", "MEMBER")).toBe(true)
		expect(roleMeets("VIEWER", "VIEWER")).toBe(true)
	})
})
