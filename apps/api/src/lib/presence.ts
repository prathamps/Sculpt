import safeRedis from "./redis"

const REDIS_MIRROR_KEY = "online_users"

const authoritativeLocalSocketsByUserId = new Map<string, Set<string>>()

export const markOnline = async (
	userId: string,
	socketId: string
): Promise<void> => {
	if (!userId) return
	let set = authoritativeLocalSocketsByUserId.get(userId)
	if (!set) {
		set = new Set()
		authoritativeLocalSocketsByUserId.set(userId, set)
	}
	set.add(socketId)
	await safeRedis.sAdd(REDIS_MIRROR_KEY, userId)
}

export const markOffline = async (
	userId: string,
	socketId: string
): Promise<void> => {
	if (!userId) return
	const set = authoritativeLocalSocketsByUserId.get(userId)
	if (!set) return
	set.delete(socketId)
	if (set.size === 0) {
		authoritativeLocalSocketsByUserId.delete(userId)
		await safeRedis.sRem(REDIS_MIRROR_KEY, userId)
	}
}

export const isUserOnline = (userId: string): boolean => {
	return authoritativeLocalSocketsByUserId.has(userId)
}

export const getOnlineUserIds = (): string[] =>
	Array.from(authoritativeLocalSocketsByUserId.keys())
