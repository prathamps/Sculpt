import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import {
	cutoffForRetention,
	retentionDaysFromEnv,
	runPeriodically,
} from "../../lib/schedule"

export const DEFAULT_NOTIFICATION_RETENTION_DAYS = 90
const PRUNE_INTERVAL_MS = 6 * 3600000

export const notificationRetentionDays = (): number | null =>
	retentionDaysFromEnv(
		"NOTIFICATION_RETENTION_DAYS",
		DEFAULT_NOTIFICATION_RETENTION_DAYS
	)

export const pruneOldNotifications = async (
	retentionDays: number,
	now = Date.now()
): Promise<number> => {
	const { count } = await prisma.notification.deleteMany({
		where: { createdAt: { lt: cutoffForRetention(retentionDays, now) } },
	})
	return count
}

export const startNotificationRetention = (): NodeJS.Timeout | null => {
	const retentionDays = notificationRetentionDays()
	if (retentionDays === null) return null
	return runPeriodically(
		"Notification retention",
		PRUNE_INTERVAL_MS,
		async () => {
			const removed = await pruneOldNotifications(retentionDays)
			if (removed > 0) {
				logger.info("Pruned old notifications", { removed, retentionDays })
			}
		},
		{ runImmediately: true }
	)
}
