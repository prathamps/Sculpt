import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { runPeriodically } from "../../lib/schedule"

const STALE_INVITATION_GRACE_MS = 30 * 24 * 3600000
const PRUNE_INTERVAL_MS = 6 * 3600000

export const pruneStaleInvitations = async (now = Date.now()): Promise<number> => {
	const { count } = await prisma.projectInvitation.deleteMany({
		where: { expiresAt: { lt: new Date(now - STALE_INVITATION_GRACE_MS) } },
	})
	return count
}

export const startInvitationMaintenance = (): NodeJS.Timeout =>
	runPeriodically(
		"Invitation pruning",
		PRUNE_INTERVAL_MS,
		async () => {
			const removed = await pruneStaleInvitations()
			if (removed > 0) logger.info("Pruned stale invitations", { removed })
		},
		{ runImmediately: true }
	)
