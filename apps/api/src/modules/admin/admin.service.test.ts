import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		user: {
			count: vi.fn(),
			findMany: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
		},
		project: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
		image: { count: vi.fn() },
		comment: { count: vi.fn() },
		$queryRaw: vi.fn(),
	},
}))

import { prisma } from "../../lib/prisma"
import { ValidationError } from "../../lib/errors"
import { getAllUsers, updateUserRole } from "./admin.service"

const mocked = prisma as unknown as {
	user: {
		count: ReturnType<typeof vi.fn>
		findMany: ReturnType<typeof vi.fn>
		findUnique: ReturnType<typeof vi.fn>
		update: ReturnType<typeof vi.fn>
	}
}

const page = { page: 1, pageSize: 30 }

describe("updateUserRole", () => {
	beforeEach(() => vi.clearAllMocks())

	it("refuses to demote the last administrator", async () => {
		mocked.user.count.mockResolvedValue(1)
		mocked.user.findUnique.mockResolvedValue({ role: "ADMIN" })

		await expect(updateUserRole("admin1", "USER")).rejects.toBeInstanceOf(
			ValidationError
		)
		expect(mocked.user.update).not.toHaveBeenCalled()
	})

	it("demotes an administrator while another one remains", async () => {
		mocked.user.count.mockResolvedValue(2)
		mocked.user.findUnique.mockResolvedValue({ role: "ADMIN" })
		mocked.user.update.mockResolvedValue({ id: "admin1", role: "USER" })

		await updateUserRole("admin1", "USER")

		expect(mocked.user.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: "admin1" } })
		)
	})

	it("revokes existing sessions whenever a role changes", async () => {
		mocked.user.count.mockResolvedValue(3)
		mocked.user.findUnique.mockResolvedValue({ role: "USER" })
		mocked.user.update.mockResolvedValue({ id: "u1", role: "ADMIN" })

		await updateUserRole("u1", "ADMIN")

		expect(mocked.user.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { role: "ADMIN", tokenVersion: { increment: 1 } },
			})
		)
	})

	it("skips the last-admin check when promoting", async () => {
		mocked.user.update.mockResolvedValue({ id: "u1", role: "ADMIN" })

		await updateUserRole("u1", "ADMIN")

		expect(mocked.user.count).not.toHaveBeenCalled()
	})

	it("never selects the password column", async () => {
		mocked.user.count.mockResolvedValue(5)
		mocked.user.findMany.mockResolvedValue([])

		await getAllUsers(page)

		const select = mocked.user.findMany.mock.calls[0][0].select
		expect(select).not.toHaveProperty("password")
		expect(select).toMatchObject({ id: true, email: true, role: true })
	})

	it("searches users case-insensitively on name and email", async () => {
		mocked.user.count.mockResolvedValue(0)
		mocked.user.findMany.mockResolvedValue([])

		await getAllUsers(page, "Ada")

		expect(mocked.user.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					OR: [
						{ email: { contains: "Ada", mode: "insensitive" } },
						{ name: { contains: "Ada", mode: "insensitive" } },
					],
				},
			})
		)
	})
})
