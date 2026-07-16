import safeRedis from "./redis"

// Socket presence tracking. The Socket.IO server and the notification code run
// in the same process, so the in-memory map is authoritative for this instance.
// We mirror to Redis for observability / future multi-instance reads.
const ONLINE_KEY = "online_users"

// userId -> set of live socket ids (a user can have multiple tabs/devices)
const localSockets = new Map<string, Set<string>>()

export const markOnline = async (
	userId: string,
	socketId: string
): Promise<void> => {
	if (!userId) return
	let set = localSockets.get(userId)
	if (!set) {
		set = new Set()
		localSockets.set(userId, set)
	}
	set.add(socketId)
	await safeRedis.sAdd(ONLINE_KEY, userId)
}

export const markOffline = async (
	userId: string,
	socketId: string
): Promise<void> => {
	if (!userId) return
	const set = localSockets.get(userId)
	if (!set) return
	set.delete(socketId)
	if (set.size === 0) {
		localSockets.delete(userId)
		await safeRedis.sRem(ONLINE_KEY, userId)
	}
}

// Authoritative for this process (where notifications are generated).
export const isUserOnline = (userId: string): boolean => {
	return localSockets.has(userId)
}

export const getOnlineUserIds = (): string[] => Array.from(localSockets.keys())
