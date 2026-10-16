import { logger } from "../../lib/logger"
import { runPeriodically } from "../../lib/schedule"
import { pruneExpiredRevocations } from "./session.service"
import { pruneExpiredPasswordResets } from "./password-reset.service"

const PRUNE_INTERVAL_MS = 3600000

export const startSessionMaintenance = (): NodeJS.Timeout =>
	runPeriodically(
		"Session and reset token pruning",
		PRUNE_INTERVAL_MS,
		async () => {
			const revocations = await pruneExpiredRevocations()
			const resets = await pruneExpiredPasswordResets()
			if (revocations + resets > 0) {
				logger.debug("Pruned expired session revocations and reset tokens", {
					revocations,
					resets,
				})
			}
		},
		{ runImmediately: true }
	)
