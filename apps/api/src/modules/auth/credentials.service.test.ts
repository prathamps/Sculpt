import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import bcrypt from "bcrypt"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		user: { findUnique: vi.fn(), update: vi.fn() },
	},
}))

vi.mock("../audit/audit.service", () => ({ recordAudit: vi.fn() }))

import { prisma } from "../../lib/prisma"
import { recordAudit } from "../audit/audit.service"
import { checkPassword, clearFailedAttempts, lockedOutMessage } from "./credentials.service"

const mocked = vi.mocked(prisma, true)
const NOW = new Date("2026-03-01T12:00:00.000Z")

let passwordHash = ""

const storedUser = (overrides: Record<string, unknown> = {}) => ({
	id: "u1",
	email: "ada@example.com",
	password: passwordHash,
	failedLoginCount: 0,
	lockedUntil: null,
	...overrides,
})

beforeEach(async () => {
	vi.clearAllMocks()
	passwordHash ||= await bcrypt.hash("correct horse", 4)
})

afterEach(() => {
	delete process.env.LOGIN_MAX_FAILED_ATTEMPTS
})

describe("checkPassword", () => {
	it("accepts the right password", async () => {
		mocked.user.findUnique.mockResolvedValue(storedUser() as never)

		const result = await checkPassword("ada@example.com", "correct horse", NOW)

		expect(result.outcome).toBe("valid")
	})

	it("counts a wrong password against the account", async () => {
		mocked.user.findUnique.mockResolvedValue(storedUser() as never)
		mocked.user.update.mockResolvedValue({ failedLoginCount: 1 } as never)

		const result = await checkPassword("ada@example.com", "wrong", NOW)

		expect(result).toEqual({ outcome: "invalid", userId: "u1" })
		expect(mocked.user.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { failedLoginCount: { increment: 1 } } })
		)
	})

	it("locks the account once the failure limit is reached, whatever address the attempts come from", async () => {
		process.env.LOGIN_MAX_FAILED_ATTEMPTS = "3"
		mocked.user.findUnique.mockResolvedValue(storedUser({ failedLoginCount: 2 }) as never)
		mocked.user.update.mockResolvedValueOnce({ failedLoginCount: 3 } as never)

		const result = await checkPassword("ada@example.com", "wrong", NOW)

		expect(result.outcome).toBe("locked")
		expect(mocked.user.update).toHaveBeenLastCalledWith({
			where: { id: "u1" },
			data: { failedLoginCount: 0, lockedUntil: new Date(NOW.getTime() + 15 * 60000) },
		})
		expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
			expect.objectContaining({ action: "user.login_locked_out", targetId: "u1" })
		)
	})

	it("refuses even the right password while the account is locked", async () => {
		const lockedUntil = new Date(NOW.getTime() + 5 * 60000)
		mocked.user.findUnique.mockResolvedValue(storedUser({ lockedUntil }) as never)

		const result = await checkPassword("ada@example.com", "correct horse", NOW)

		expect(result).toEqual({ outcome: "locked", lockedUntil })
	})

	it("spends the same hashing work on unknown addresses so they cannot be told apart by timing", async () => {
		mocked.user.findUnique.mockResolvedValue(null)
		const compare = vi.spyOn(bcrypt, "compare")

		const result = await checkPassword("nobody@example.com", "anything", NOW)

		expect(result).toEqual({ outcome: "invalid", userId: null })
		expect(compare).toHaveBeenCalled()
		compare.mockRestore()
	})
})

describe("clearFailedAttempts", () => {
	it("skips the write when there is nothing to clear", async () => {
		await clearFailedAttempts({ id: "u1", failedLoginCount: 0, lockedUntil: null })

		expect(mocked.user.update).not.toHaveBeenCalled()
	})
})

describe("lockedOutMessage", () => {
	it("tells the person how long to wait", () => {
		expect(lockedOutMessage(new Date(NOW.getTime() + 90000), NOW)).toMatch(/2 minutes/)
	})
})
