import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import {
	cutoffForRetention,
	retentionDaysFromEnv,
	runPeriodically,
} from "../../lib/schedule"

const PRUNE_INTERVAL_MS = 24 * 3600000

export const auditRetentionDays = (): number | null =>
	retentionDaysFromEnv("AUDIT_RETENTION_DAYS", null)

export const pruneOldAuditLogs = async (
	retentionDays: number,
	now = Date.now()
): Promise<number> => {
	const { count } = await prisma.auditLog.deleteMany({
		where: { createdAt: { lt: cutoffForRetention(retentionDays, now) } },
	})
	return count
}

export const startAuditRetention = (): NodeJS.Timeout | null => {
	const retentionDays = auditRetentionDays()
	if (retentionDays === null) return null
	return runPeriodically(
		"Audit log retention",
		PRUNE_INTERVAL_MS,
		async () => {
			const removed = await pruneOldAuditLogs(retentionDays)
			if (removed > 0) {
				logger.info("Pruned old audit log entries", { removed, retentionDays })
			}
		},
		{ runImmediately: true }
	)
}
