import safeRedis from "../lib/redis"

export interface ViewerUser {
	id: string
	name: string | null
	avatarUrl: string | null
}

export interface ViewerEntry {
	socketId: string
	user: ViewerUser
	time: number
}

const VIEWER_TTL_SECONDS = 120
const TIME_SYNC_INTERVAL_MS = 2000

const viewersByVersion = new Map<string, Map<string, ViewerEntry>>()
const lastSyncedAt = new Map<string, number>()

const viewerKey = (imageVersionId: string): string =>
	`viewers:${imageVersionId}`

const localRoom = (imageVersionId: string): Map<string, ViewerEntry> => {
	let room = viewersByVersion.get(imageVersionId)
	if (!room) {
		room = new Map()
		viewersByVersion.set(imageVersionId, room)
	}
	return room
}

const publish = async (
	imageVersionId: string,
	entry: ViewerEntry
): Promise<void> => {
	const key = viewerKey(imageVersionId)
	await safeRedis.hSet(key, entry.socketId, JSON.stringify(entry))
	await safeRedis.expire(key, VIEWER_TTL_SECONDS)
}

const parseEntry = (raw: string | Buffer): ViewerEntry | null => {
	try {
		const parsed = JSON.parse(raw.toString()) as ViewerEntry
		return typeof parsed?.socketId === "string" ? parsed : null
	} catch {
		return null
	}
}

export const addViewer = async (
	imageVersionId: string,
	socketId: string,
	user: ViewerUser
): Promise<void> => {
	const entry: ViewerEntry = { socketId, user, time: 0 }
	localRoom(imageVersionId).set(socketId, entry)
	lastSyncedAt.set(socketId, Date.now())
	await publish(imageVersionId, entry)
}

export const updateViewer = async (
	imageVersionId: string,
	socketId: string,
	time: number
): Promise<boolean> => {
	const entry = viewersByVersion.get(imageVersionId)?.get(socketId)
	if (!entry) return false
	entry.time = time

	const syncedAt = lastSyncedAt.get(socketId) ?? 0
	if (Date.now() - syncedAt >= TIME_SYNC_INTERVAL_MS) {
		lastSyncedAt.set(socketId, Date.now())
		await publish(imageVersionId, entry)
	}

	return true
}

export const removeViewer = async (
	imageVersionId: string,
	socketId: string
): Promise<void> => {
	const room = viewersByVersion.get(imageVersionId)
	if (room) {
		room.delete(socketId)
		if (room.size === 0) viewersByVersion.delete(imageVersionId)
	}
	lastSyncedAt.delete(socketId)
	await safeRedis.hDel(viewerKey(imageVersionId), socketId)
}

export const getViewers = async (
	imageVersionId: string
): Promise<ViewerEntry[]> => {
	const local = Array.from(
		viewersByVersion.get(imageVersionId)?.values() ?? []
	)
	const shared = await safeRedis.hVals(viewerKey(imageVersionId))

	const merged = new Map<string, ViewerEntry>()
	for (const raw of shared) {
		const entry = parseEntry(raw)
		if (entry) merged.set(entry.socketId, entry)
	}
	for (const entry of local) merged.set(entry.socketId, entry)

	return Array.from(merged.values())
}

export const refreshViewerTtls = async (): Promise<void> => {
	for (const imageVersionId of viewersByVersion.keys()) {
		await safeRedis.expire(viewerKey(imageVersionId), VIEWER_TTL_SECONDS)
	}
}
