import { logger } from "../../lib/logger"
import { pruneExpiredRevocations } from "./session.service"

const PRUNE_INTERVAL_MS = 3600000

export const startSessionMaintenance = (): NodeJS.Timeout => {
	const prune = () =>
		pruneExpiredRevocations()
			.then((count) => {
				if (count > 0) logger.debug("Pruned expired session revocations", { count })
			})
			.catch((error) =>
				logger.error("Session revocation pruning failed", error)
			)

	void prune()

	const timer = setInterval(prune, PRUNE_INTERVAL_MS)
	timer.unref()
	return timer
}
