import { describe, expect, it, vi, afterEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: { auditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } },
}))

import { auditRetentionDays, startAuditRetention } from "./audit.maintenance"

afterEach(() => {
	delete process.env.AUDIT_RETENTION_DAYS
})

describe("audit retention", () => {
	it("keeps the audit trail forever unless an operator opts in", () => {
		expect(auditRetentionDays()).toBeNull()
		expect(startAuditRetention()).toBeNull()
	})

	it("honours a configured retention window", () => {
		process.env.AUDIT_RETENTION_DAYS = "400"
		expect(auditRetentionDays()).toBe(400)
	})
})
