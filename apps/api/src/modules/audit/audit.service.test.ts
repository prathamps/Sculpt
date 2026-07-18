import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		auditLog: {
			create: vi.fn(),
			count: vi.fn(),
			findMany: vi.fn(),
		},
	},
}))

import { Request } from "express"
import { prisma } from "../../lib/prisma"
import { listAuditLogs, recordAudit, requestIp } from "./audit.service"

const mocked = vi.mocked(prisma, true)

describe("recordAudit", () => {
	beforeEach(() => vi.clearAllMocks())

	it("persists the entry with actor, target and ip", async () => {
		mocked.auditLog.create.mockResolvedValue({} as never)

		await recordAudit({
			action: "project.created",
			targetType: "project",
			targetId: "p1",
			actorId: "u1",
			metadata: { name: "Site" },
			ipAddress: "10.0.0.1",
		})

		expect(mocked.auditLog.create).toHaveBeenCalledWith({
			data: {
				action: "project.created",
				targetType: "project",
				targetId: "p1",
				actorId: "u1",
				metadata: { name: "Site" },
				ipAddress: "10.0.0.1",
			},
		})
	})

	it("never fails the calling request when the write fails", async () => {
		mocked.auditLog.create.mockRejectedValue(new Error("db down"))

		await expect(
			recordAudit({
				action: "user.login_succeeded",
				targetType: "user",
				targetId: "u1",
			})
		).resolves.toBeUndefined()
	})
})

describe("listAuditLogs", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocked.auditLog.count.mockResolvedValue(120 as never)
		mocked.auditLog.findMany.mockResolvedValue([] as never)
	})

	it("paginates with skip/take derived from page and pageSize", async () => {
		const result = await listAuditLogs({ page: 3, pageSize: 25 })

		expect(mocked.auditLog.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: 50, take: 25 })
		)
		expect(result).toMatchObject({ total: 120, page: 3, pageSize: 25 })
	})

	it("filters by action and actor when provided", async () => {
		await listAuditLogs({
			page: 1,
			pageSize: 10,
			action: "user.login_failed",
			actorId: "u1",
		})

		expect(mocked.auditLog.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { action: "user.login_failed", actorId: "u1" },
			})
		)
	})
})

describe("requestIp", () => {
	it("uses Express-resolved req.ip so a spoofed header can't win", () => {
		const req = {
			headers: { "x-forwarded-for": "203.0.113.7" },
			ip: "10.0.0.2",
		} as unknown as Request

		expect(requestIp(req)).toBe("10.0.0.2")
	})

	it("returns null when no ip is resolved", () => {
		const req = { headers: {} } as unknown as Request

		expect(requestIp(req)).toBeNull()
	})
})
