import { prisma } from "../../lib/prisma"
import { logger } from "../../lib/logger"
import { runPeriodically } from "../../lib/schedule"
import { pruneRetiredSigningKeys, rotateSigningKeyIfDue } from "./signing-keys.service"
import { pruneUnusedDynamicClients } from "./clients.service"

const MAINTENANCE_INTERVAL_MS = 3600000
const MAINTENANCE_LOCK_KEY = 815_431_019
const MAINTENANCE_TIMEOUT_MS = 120000

export const pruneSpentOAuthCredentials = async (now = Date.now()) => {
	const expired = { expiresAt: { lt: new Date(now) } }
	const codes = await prisma.oAuthAuthorizationCode.deleteMany({ where: expired })
	const refreshTokens = await prisma.oAuthRefreshToken.deleteMany({ where: expired })
	const consumedRequests = await prisma.oAuthConsumedRequest.deleteMany({ where: expired })
	return {
		codes: codes.count,
		refreshTokens: refreshTokens.count,
		consumedRequests: consumedRequests.count,
	}
}

const runOnOneInstance = <T>(task: () => Promise<T>): Promise<T | null> =>
	prisma.$transaction(
		async (tx) => {
			const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(${MAINTENANCE_LOCK_KEY}::bigint) AS acquired`
			return lock?.acquired ? task() : null
		},
		{ timeout: MAINTENANCE_TIMEOUT_MS }
	)

export const maintainOAuthState = async () => {
	const spent = await pruneSpentOAuthCredentials()
	const rotated = await rotateSigningKeyIfDue()
	const retiredKeys = await pruneRetiredSigningKeys()
	const clients = await pruneUnusedDynamicClients()
	const summary = { ...spent, rotated, retiredKeys, clients }
	const pruned = spent.codes + spent.refreshTokens + spent.consumedRequests + retiredKeys + clients
	if (pruned > 0 || rotated) {
		logger.info("OAuth maintenance finished", summary)
	}
	return summary
}

export const runOAuthMaintenance = () => runOnOneInstance(maintainOAuthState)

export const startOAuthMaintenance = (): NodeJS.Timeout =>
	runPeriodically("OAuth maintenance", MAINTENANCE_INTERVAL_MS, runOAuthMaintenance, {
		runImmediately: true,
	})
