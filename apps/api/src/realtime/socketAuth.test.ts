import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma", () => ({
	prisma: { user: { findUnique: vi.fn() } },
}))

import jwt from "jsonwebtoken"
import { Socket } from "socket.io"
import { prisma } from "../lib/prisma"
import { resolveSocketUser, socketAuth } from "./socketAuth"

const mocked = vi.mocked(prisma, true)
const JWT_SECRET = "socket-auth-test-secret"

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
}

beforeEach(() => {
	vi.clearAllMocks()
	process.env.JWT_SECRET = JWT_SECRET
})

describe("socketAuth", () => {
	it("admits a cookieless connection without an identity", async () => {
		const socket = socketWithCookie()
		const next = vi.fn()

		await socketAuth(socket, next)

		expect(next).toHaveBeenCalledWith()
		expect(socket.data.user).toBeNull()
	})

	it("admits a connection with an unverifiable token instead of rejecting it", async () => {
		const socket = socketWithCookie("token=not-a-real-jwt")
		const next = vi.fn()

		await socketAuth(socket, next)

		expect(next).toHaveBeenCalledWith()
		expect(socket.data.user).toBeNull()
	})

	it("attaches the verified user so presence and room access can use it", async () => {
		mocked.user.findUnique.mockResolvedValue(storedUser as never)
		const token = jwt.sign({ id: "u1" }, JWT_SECRET)
		const socket = socketWithCookie(`token=${token}`)
		const next = vi.fn()

		await socketAuth(socket, next)

		expect(next).toHaveBeenCalledWith()
		expect(socket.data.user).toEqual(storedUser)
	})
})

describe("resolveSocketUser", () => {
	it("returns null for a token signed with the wrong secret", async () => {
		const token = jwt.sign({ id: "u1" }, "a-different-secret")

		expect(await resolveSocketUser(socketWithCookie(`token=${token}`))).toBeNull()
		expect(mocked.user.findUnique).not.toHaveBeenCalled()
	})

	it("returns null when the token carries no user id", async () => {
		const token = jwt.sign({ role: "ADMIN" }, JWT_SECRET)

		expect(await resolveSocketUser(socketWithCookie(`token=${token}`))).toBeNull()
		expect(mocked.user.findUnique).not.toHaveBeenCalled()
	})

	it("returns null when the signed user no longer exists", async () => {
		mocked.user.findUnique.mockResolvedValue(null)
		const token = jwt.sign({ id: "deleted" }, JWT_SECRET)

		expect(await resolveSocketUser(socketWithCookie(`token=${token}`))).toBeNull()
	})

	it("never exposes the password column to socket consumers", async () => {
		mocked.user.findUnique.mockResolvedValue(storedUser as never)
		const token = jwt.sign({ id: "u1" }, JWT_SECRET)

		await resolveSocketUser(socketWithCookie(`token=${token}`))

		expect(mocked.user.findUnique).toHaveBeenCalledWith({
			where: { id: "u1" },
			select: { id: true, name: true, email: true, avatarUrl: true },
		})
	})
})
