import { describe, expect, it } from "vitest"
import { signalsLostSession } from "./api"
import { safeDestination } from "@/context/AuthContext"

describe("signalsLostSession", () => {
	it("treats a 401 on an authenticated endpoint as an expired session", () => {
		expect(signalsLostSession(401, "/api/projects/p1")).toBe(true)
		expect(signalsLostSession(401, "/api/images/versions/v1/comments")).toBe(
			true
		)
	})

	it("ignores a 401 from signing in, so a bad password is not a session loss", () => {
		expect(signalsLostSession(401, "/api/auth/login")).toBe(false)
		expect(signalsLostSession(401, "/api/admin/login")).toBe(false)
	})

	it("ignores a 401 from the probe that decides whether anyone is signed in", () => {
		expect(signalsLostSession(401, "/api/users/profile")).toBe(false)
		expect(signalsLostSession(401, "/api/users/me")).toBe(false)
		expect(signalsLostSession(401, "/api/users/me?fields=all")).toBe(false)
	})

	it("still reports a lost session on the account routes under /me", () => {
		expect(signalsLostSession(401, "/api/users/me/password")).toBe(true)
		expect(signalsLostSession(401, "/api/users/me/export")).toBe(true)
		expect(signalsLostSession(401, "/api/users/me/notification-preferences")).toBe(
			true
		)
	})

	it("ignores a 401 from any password-reset step", () => {
		expect(signalsLostSession(401, "/api/auth/password-reset/request")).toBe(
			false
		)
		expect(signalsLostSession(401, "/api/auth/password-reset/complete")).toBe(
			false
		)
	})

	it("ignores every other status", () => {
		expect(signalsLostSession(403, "/api/projects/p1")).toBe(false)
		expect(signalsLostSession(500, "/api/projects/p1")).toBe(false)
		expect(signalsLostSession(200, "/api/projects/p1")).toBe(false)
	})
})

describe("safeDestination", () => {
	it("keeps an in-app path", () => {
		expect(safeDestination("/project/p1?v=2")).toBe("/project/p1?v=2")
	})

	it("refuses a protocol-relative redirect to another host", () => {
		expect(safeDestination("//evil.example.com")).toBe("/dashboard")
	})

	it("refuses an absolute URL", () => {
		expect(safeDestination("https://evil.example.com")).toBe("/dashboard")
	})

	it("falls back to the dashboard when nothing is requested", () => {
		expect(safeDestination(undefined)).toBe("/dashboard")
		expect(safeDestination(null)).toBe("/dashboard")
		expect(safeDestination("")).toBe("/dashboard")
	})
})
