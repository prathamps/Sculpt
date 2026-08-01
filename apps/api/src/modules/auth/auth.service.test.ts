import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		user: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			create: vi.fn(),
		},
	},
}))

vi.mock("../audit/audit.service", () => ({
	recordAudit: vi.fn(),
}))

import { prisma } from "../../lib/prisma"
import { recordAudit } from "../audit/audit.service"
import { findOrCreateOAuthUser } from "./auth.service"

const mocked = vi.mocked(prisma, true)

const googleIdentity = {
	provider: "google",
	providerId: "g-123",
	email: "victim@corp.com",
	emailVerified: true,
	name: "Victim",
	avatarUrl: null,
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe("findOrCreateOAuthUser", () => {
	it("returns the user already linked to this provider identity", async () => {
		const linkedUser = { id: "u1", avatarUrl: "x" }
		mocked.user.findFirst.mockResolvedValue(linkedUser as never)

		const user = await findOrCreateOAuthUser(googleIdentity)

		expect(user).toBe(linkedUser)
		expect(mocked.user.findUnique).not.toHaveBeenCalled()
	})

	it("refuses to link an existing account when the provider email is unverified", async () => {
		mocked.user.findFirst.mockResolvedValue(null)
		mocked.user.findUnique.mockResolvedValue({
			id: "victim",
			providerId: null,
		} as never)

		const user = await findOrCreateOAuthUser({
			...googleIdentity,
			emailVerified: false,
		})

		expect(user).toBeNull()
		expect(mocked.user.update).not.toHaveBeenCalled()
		expect(mocked.user.create).not.toHaveBeenCalled()
	})

	it("refuses to hijack an account already linked to another provider identity", async () => {
		mocked.user.findFirst.mockResolvedValue(null)
		mocked.user.findUnique.mockResolvedValue({
			id: "victim",
			providerId: "github-999",
		} as never)

		const user = await findOrCreateOAuthUser(googleIdentity)

		expect(user).toBeNull()
		expect(mocked.user.update).not.toHaveBeenCalled()
	})

	it("links a verified provider email to an unlinked account and audits it", async () => {
		mocked.user.findFirst.mockResolvedValue(null)
		mocked.user.findUnique.mockResolvedValue({
			id: "u2",
			providerId: null,
			avatarUrl: null,
		} as never)
		mocked.user.update.mockResolvedValue({ id: "u2" } as never)

		const user = await findOrCreateOAuthUser(googleIdentity)

		expect(user).toEqual({ id: "u2" })
		expect(mocked.user.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "u2" },
				data: expect.objectContaining({
					provider: "google",
					providerId: "g-123",
				}),
			})
		)
		expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
			expect.objectContaining({ action: "user.oauth_linked" })
		)
	})

	it("creates a fresh account when no user owns the email", async () => {
		mocked.user.findFirst.mockResolvedValue(null)
		mocked.user.findUnique.mockResolvedValue(null)
		mocked.user.create.mockResolvedValue({ id: "new" } as never)

		const user = await findOrCreateOAuthUser(googleIdentity)

		expect(user).toEqual({ id: "new" })
	})
})
