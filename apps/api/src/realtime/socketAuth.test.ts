import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

vi.mock("../lib/prisma", () => ({
	prisma: {
		user: { findUnique: vi.fn() },
		revokedSession: { findUnique: vi.fn() },
	},
}))

import { Socket } from "socket.io"
import { prisma } from "../lib/prisma"
import { signSessionToken } from "../lib/tokens"
import { resolveSocketUser, socketAuth } from "./socketAuth"
import { clearSessionCache } from "../modules/auth/session.service"

const mocked = vi.mocked(prisma, true)
const JWT_SECRET = "socket-auth-test-secret-that-is-long-enough"

const socketWithCookie = (cookie?: string) =>
	({
		handshake: { headers: cookie ? { cookie } : {} },
		data: {},
	}) as unknown as Socket

const storedUser = {
	id: "u1",
	name: "Ada",
	email: "ada@example.com",
	avatarUrl: null,
	tokenVersion: 0,
}

const publicUser = {
	id: "u1",
	name: "Ada",
	email: "ada@example.com",
	avatarUrl: null,
}

const userSessionCookie = (
	subject: { id: string; tokenVersion: number } = { id: "u1", tokenVersion: 0 }
) => `token=${signSessionToken(subject, "user", 60000).token}`

beforeEach(() => {
	vi.clearAllMocks()
	clearSessionCache()
	process.env.JWT_SECRET = JWT_SECRET
	mocked.revokedSession.findUnique.mockResolvedValue(null)
})

describe("socketAuth", () => {
	it("rejects a cookieless connection instead of admitting an anonymous socket", async () => {
		const socket = socketWithCookie()
		const next = vi.fn()

		await socketAuth(socket, next)

		expect(next).toHaveBeenCalledWith(expect.any(Error))
		expect(socket.data.user).toBeUndefined()
	})

	it("rejects a connection carrying an unverifiable token", async () => {
		const socket = socketWithCookie("token=not-a-real-jwt")
		const next = vi.fn()

		await socketAuth(socket, next)

		expect(next).toHaveBeenCalledWith(expect.any(Error))
		expect(socket.data.user).toBeUndefined()
	})

	it("rejects an admin token presented on the user socket channel", async () => {
		mocked.user.findUnique.mockResolvedValue(storedUser as never)
		const adminToken = signSessionToken(
			{ id: "u1", tokenVersion: 0 },
			"admin",
			60000
		).token
		const next = vi.fn()

		await socketAuth(socketWithCookie(`token=${adminToken}`), next)

		expect(next).toHaveBeenCalledWith(expect.any(Error))
	})

	it("attaches the verified user so presence and room access can use it", async () => {
		mocked.user.findUnique.mockResolvedValue(storedUser as never)
		const socket = socketWithCookie(userSessionCookie())
		const next = vi.fn()

		await socketAuth(socket, next)

		expect(next).toHaveBeenCalledWith()
		expect(socket.data.user).toEqual(publicUser)
	})
})

describe("resolveSocketUser", () => {
	it("returns null for a token signed with the wrong secret", async () => {
		const cookie = userSessionCookie()
		process.env.JWT_SECRET = "a-different-secret-that-is-also-long-enough"

		expect(await resolveSocketUser(socketWithCookie(cookie))).toBeNull()
		expect(mocked.user.findUnique).not.toHaveBeenCalled()
	})

	it("returns null when the signed user no longer exists", async () => {
		mocked.user.findUnique.mockResolvedValue(null)

		expect(await resolveSocketUser(socketWithCookie(userSessionCookie()))).toBeNull()
	})

	it("returns null when the session was revoked by a logout", async () => {
		mocked.revokedSession.findUnique.mockResolvedValue({ jti: "x" } as never)

		expect(await resolveSocketUser(socketWithCookie(userSessionCookie()))).toBeNull()
		expect(mocked.user.findUnique).not.toHaveBeenCalled()
	})

	it("returns null when the token predates a password change", async () => {
		mocked.user.findUnique.mockResolvedValue({
			...storedUser,
			tokenVersion: 3,
		} as never)

		expect(
			await resolveSocketUser(
				socketWithCookie(userSessionCookie({ id: "u1", tokenVersion: 2 }))
			)
		).toBeNull()
	})

	it("never exposes the password column to socket consumers", async () => {
		mocked.user.findUnique.mockResolvedValue({
			...storedUser,
			password: "bcrypt-hash",
		} as never)

		const user = await resolveSocketUser(socketWithCookie(userSessionCookie()))

		expect(user).toEqual(publicUser)
	})

	it("reuses a verified session briefly instead of re-querying on every connection", async () => {
		mocked.user.findUnique.mockResolvedValue(storedUser as never)
		const cookie = userSessionCookie()

		await resolveSocketUser(socketWithCookie(cookie))
		await resolveSocketUser(socketWithCookie(cookie))

		expect(mocked.user.findUnique).toHaveBeenCalledTimes(1)
		expect(mocked.revokedSession.findUnique).toHaveBeenCalledTimes(1)
	})
})

describe("organisation-wide two-factor", () => {
	afterEach(() => {
		delete process.env.MFA_REQUIRED
	})

	it("keeps realtime events from people who have not enrolled yet", async () => {
		process.env.MFA_REQUIRED = "true"
		mocked.user.findUnique.mockResolvedValue({ ...storedUser, totpEnabledAt: null } as never)

		expect(await resolveSocketUser(socketWithCookie(userSessionCookie()))).toBeNull()
	})

	it("admits enrolled people", async () => {
		process.env.MFA_REQUIRED = "true"
		mocked.user.findUnique.mockResolvedValue({ ...storedUser, totpEnabledAt: new Date() } as never)

		expect(await resolveSocketUser(socketWithCookie(userSessionCookie()))).toEqual(publicUser)
	})
})
