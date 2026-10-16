import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: { notification: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) } },
}))

import { prisma } from "../../lib/prisma"
import {
	DEFAULT_NOTIFICATION_RETENTION_DAYS,
	notificationRetentionDays,
	pruneOldNotifications,
} from "./notification.maintenance"

describe("notification retention", () => {
	it("keeps notifications for 90 days unless configured otherwise", () => {
		delete process.env.NOTIFICATION_RETENTION_DAYS
		expect(notificationRetentionDays()).toBe(DEFAULT_NOTIFICATION_RETENTION_DAYS)
	})

	it("deletes only notifications older than the retention window", async () => {
		const now = 100 * 86400000

		const removed = await pruneOldNotifications(90, now)

		expect(removed).toBe(4)
		expect(vi.mocked(prisma.notification.deleteMany)).toHaveBeenCalledWith({
			where: { createdAt: { lt: new Date(10 * 86400000) } },
		})
	})
})
