import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: { projectInvitation: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) } },
}))

import { prisma } from "../../lib/prisma"
import { pruneStaleInvitations } from "./invitation.maintenance"

describe("pruneStaleInvitations", () => {
	it("removes invitations, and the addresses they hold, thirty days after they expire", async () => {
		const now = Date.UTC(2026, 5, 1)

		expect(await pruneStaleInvitations(now)).toBe(2)
		expect(vi.mocked(prisma.projectInvitation.deleteMany)).toHaveBeenCalledWith({
			where: { expiresAt: { lt: new Date(now - 30 * 24 * 3600000) } },
		})
	})
})
