import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		user: { findUnique: vi.fn(), update: vi.fn() },
		revokedSession: { findUnique: vi.fn(), upsert: vi.fn() },
	},
}))

vi.mock("../oauth/credential-changes", () => ({
	endDelegatedAccess: vi.fn(async () => ({ connections: 0, personalAccessTokens: 0 })),
}))

import { prisma } from "../../lib/prisma"
import { endDelegatedAccess } from "../oauth/credential-changes"
import {
	clearSessionCache,
	revokeAllSessionsForUser,
	revokeSession,
	userForSession,
} from "./session.service"

const mocked = vi.mocked(prisma, true)

const claims = { id: "u1", jti: "session-1", ver: 0, typ: "user" as const, sst: 0 }

beforeEach(() => {
	vi.clearAllMocks()
	clearSessionCache()
	mocked.revokedSession.findUnique.mockResolvedValue(null)
	mocked.user.findUnique.mockResolvedValue({ id: "u1", tokenVersion: 0 } as never)
})

describe("userForSession", () => {
	it("serves repeated requests on one session from a single lookup", async () => {
		await userForSession(claims)
		await userForSession(claims)

		expect(mocked.user.findUnique).toHaveBeenCalledTimes(1)
	})

	it("rejects the session immediately after a logout on this instance", async () => {
		await userForSession(claims)
		await revokeSession(claims)
		mocked.revokedSession.findUnique.mockResolvedValue({ jti: "session-1" } as never)

		expect(await userForSession(claims)).toBeNull()
	})

	it("rejects every session immediately after the user's sessions are revoked", async () => {
		await userForSession(claims)
		await revokeAllSessionsForUser("u1")
		mocked.user.findUnique.mockResolvedValue({ id: "u1", tokenVersion: 1 } as never)

		expect(await userForSession(claims)).toBeNull()
		expect(vi.mocked(endDelegatedAccess)).toHaveBeenCalledWith("u1", "signed_out_everywhere")
	})

	it("never caches a session whose token version is stale", async () => {
		mocked.user.findUnique.mockResolvedValue({ id: "u1", tokenVersion: 2 } as never)

		expect(await userForSession(claims)).toBeNull()
		expect(await userForSession(claims)).toBeNull()
		expect(mocked.user.findUnique).toHaveBeenCalledTimes(2)
	})
})
