import { describe, expect, it } from "vitest"
import { mediaUrl, roleAtLeast } from "./utils"

describe("roleAtLeast", () => {
	it("ranks VIEWER below MEMBER below EDITOR below OWNER", () => {
		expect(roleAtLeast("OWNER", "EDITOR")).toBe(true)
		expect(roleAtLeast("EDITOR", "EDITOR")).toBe(true)
		expect(roleAtLeast("MEMBER", "EDITOR")).toBe(false)
		expect(roleAtLeast("VIEWER", "MEMBER")).toBe(false)
		expect(roleAtLeast("MEMBER", "MEMBER")).toBe(true)
	})

	it("denies everything without a role", () => {
		expect(roleAtLeast(null, "VIEWER")).toBe(false)
		expect(roleAtLeast(undefined, "VIEWER")).toBe(false)
	})
})

describe("mediaUrl", () => {
	it("passes absolute object-store urls through untouched", () => {
		expect(mediaUrl("https://bucket.example.com/a.png")).toBe(
			"https://bucket.example.com/a.png"
		)
		expect(mediaUrl("http://bucket.example.com/a.png")).toBe(
			"http://bucket.example.com/a.png"
		)
	})

	it("roots a stored relative path so the uploads rewrite picks it up", () => {
		expect(mediaUrl("uploads/a.png")).toBe("/uploads/a.png")
		expect(mediaUrl("/uploads/a.png")).toBe("/uploads/a.png")
	})
})
