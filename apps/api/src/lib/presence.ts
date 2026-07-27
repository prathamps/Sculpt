import safeRedis from "./redis"
import { logger } from "./logger"

const PRESENCE_TTL_SECONDS = 90
const PRESENCE_HEARTBEAT_MS = 30000

const presenceKey = (userId: string): string => `presence:user:${userId}`

const localSocketsByUserId = new Map<string, Set<string>>()

export const markOnline = async (
	userId: string,
	socketId: string
): Promise<void> => {
	if (!userId) return

	let sockets = localSocketsByUserId.get(userId)
	if (!sockets) {
		sockets = new Set()
		localSocketsByUserId.set(userId, sockets)
	}
	sockets.add(socketId)

	const key = presenceKey(userId)
	await safeRedis.sAdd(key, socketId)
	await safeRedis.expire(key, PRESENCE_TTL_SECONDS)
}

export const markOffline = async (
	userId: string,
	socketId: string
): Promise<void> => {
	if (!userId) return

	const sockets = localSocketsByUserId.get(userId)
	if (sockets) {
		sockets.delete(socketId)
		if (sockets.size === 0) localSocketsByUserId.delete(userId)
	}

	const key = presenceKey(userId)
	await safeRedis.sRem(key, socketId)
	if ((await safeRedis.sCard(key)) === 0) {
		await safeRedis.del(key)
	}
}

export const isUserOnline = async (userId: string): Promise<boolean> => {
	if (localSocketsByUserId.has(userId)) return true
	return Number(await safeRedis.exists(presenceKey(userId))) > 0
}

export const startPresenceHeartbeat = (): NodeJS.Timeout => {
	const refresh = async () => {
		for (const userId of localSocketsByUserId.keys()) {
			await safeRedis.expire(presenceKey(userId), PRESENCE_TTL_SECONDS)
		}
	}

	const timer = setInterval(() => {
		refresh().catch((error) =>
			logger.error("Presence heartbeat failed", error)
		)
	}, PRESENCE_HEARTBEAT_MS)
	timer.unref()
	return timer
}
