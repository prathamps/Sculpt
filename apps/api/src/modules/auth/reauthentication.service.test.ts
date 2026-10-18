import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock("./mfa.service", () => ({
	hasMfa: (user: { totpEnabledAt: Date | null }) => !!user.totpEnabledAt,
	requireSecondFactor: vi.fn(async () => undefined),
}))

import bcrypt from "bcrypt"
import { prisma } from "../../lib/prisma"
import { requireSecondFactor } from "./mfa.service"
import { RECENT_SIGN_IN_MS, ReauthenticationRequiredError, confirmIdentity } from "./reauthentication.service"

const NOW = 1_800_000_000_000
const findUser = vi.mocked(prisma.user.findUnique)

describe("confirmIdentity", () => {
	beforeEach(() => vi.clearAllMocks())

	it("asks people with a password to type it again", async () => {
		findUser.mockResolvedValue({ id: "u1", password: await bcrypt.hash("secret-pass", 4) } as never)

		await expect(confirmIdentity("u1", {}, NOW, NOW)).rejects.toThrow(/Confirm your password/)
		await expect(confirmIdentity("u1", { password: "wrong" }, NOW, NOW)).rejects.toThrow(/not correct/)
		await expect(confirmIdentity("u1", { password: "secret-pass" }, NOW, NOW)).resolves.toBeUndefined()
	})

	it("asks passwordless people with two-factor for a code", async () => {
		findUser.mockResolvedValue({ id: "u1", password: null, totpEnabledAt: new Date() } as never)

		await expect(confirmIdentity("u1", {}, NOW, NOW)).rejects.toThrow(/authenticator/)
		await confirmIdentity("u1", { code: "123456" }, NOW, NOW)
		expect(vi.mocked(requireSecondFactor)).toHaveBeenCalledWith("u1", { code: "123456" })
	})

	it("asks people with neither to have signed in within the last few minutes", async () => {
		findUser.mockResolvedValue({ id: "u1", password: null, totpEnabledAt: null } as never)

		await expect(confirmIdentity("u1", {}, NOW - 60000, NOW)).resolves.toBeUndefined()
		await expect(confirmIdentity("u1", {}, NOW - RECENT_SIGN_IN_MS, NOW)).rejects.toBeInstanceOf(
			ReauthenticationRequiredError
		)
		await expect(confirmIdentity("u1", {}, undefined, NOW)).rejects.toBeInstanceOf(
			ReauthenticationRequiredError
		)
	})
})
