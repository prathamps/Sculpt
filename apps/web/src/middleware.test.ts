import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { middleware } from "./middleware"

const request = (pathname: string, cookies: Record<string, string> = {}) => {
	const url = `https://sculpt.example.com${pathname}`
	const cookieHeader = Object.entries(cookies)
		.map(([name, value]) => `${name}=${value}`)
		.join("; ")
	return new NextRequest(url, {
		headers: cookieHeader ? { cookie: cookieHeader } : {},
	})
}

const locationOf = (pathname: string, cookies?: Record<string, string>) =>
	middleware(request(pathname, cookies)).headers.get("location")

describe("route protection", () => {
	it("sends a signed-out visitor from a project to login with a return path", () => {
		const location = locationOf("/project/p1")
		expect(location).toContain("/login")
		expect(location).toContain(`next=${encodeURIComponent("/project/p1")}`)
	})

	it("guards the dashboard and account areas", () => {
		expect(locationOf("/dashboard")).toContain("/login")
		expect(locationOf("/account")).toContain("/login")
	})

	it("lets a signed-in visitor through", () => {
		const response = middleware(request("/dashboard", { token: "session" }))
		expect(response.headers.get("location")).toBeNull()
	})

	it("sends a signed-out visitor from admin to the admin login", () => {
		expect(locationOf("/admin/users")).toContain("/admin-login")
	})

	it("does not accept a user session as an admin session", () => {
		expect(locationOf("/admin", { token: "session" })).toContain(
			"/admin-login"
		)
	})

	it("accepts an admin session for admin routes", () => {
		const response = middleware(
			request("/admin", { admin_token: "admin-session" })
		)
		expect(response.headers.get("location")).toBeNull()
	})

	it("bounces a signed-in visitor away from login and register", () => {
		expect(locationOf("/login", { token: "session" })).toContain("/dashboard")
		expect(locationOf("/register", { token: "session" })).toContain(
			"/dashboard"
		)
	})

	it("leaves login reachable when signed out", () => {
		expect(middleware(request("/login")).headers.get("location")).toBeNull()
	})

	it("does not treat a lookalike prefix as a protected route", () => {
		expect(middleware(request("/projects-help")).headers.get("location")).toBeNull()
	})
})
