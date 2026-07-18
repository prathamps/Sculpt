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

// Per-process viewer map: versionId -> socketId -> entry. Playhead presence is
// ephemeral, so process memory is enough for a single-instance deploy; a
// multi-instance setup would need the Redis mirror pattern from lib/presence.ts.
const viewersByVersion = new Map<string, Map<string, ViewerEntry>>()

export const addViewer = (
	imageVersionId: string,
	socketId: string,
	user: ViewerUser
): void => {
	let room = viewersByVersion.get(imageVersionId)
	if (!room) {
		room = new Map()
		viewersByVersion.set(imageVersionId, room)
	}
	room.set(socketId, { socketId, user, time: 0 })
}

export const updateViewer = (
	imageVersionId: string,
	socketId: string,
	time: number
): boolean => {
	const entry = viewersByVersion.get(imageVersionId)?.get(socketId)
	if (!entry) return false
	entry.time = time
	return true
}

export const removeViewer = (
	imageVersionId: string,
	socketId: string
): void => {
	const room = viewersByVersion.get(imageVersionId)
	if (!room) return
	room.delete(socketId)
	if (room.size === 0) viewersByVersion.delete(imageVersionId)
}

export const getViewers = (imageVersionId: string): ViewerEntry[] =>
	Array.from(viewersByVersion.get(imageVersionId)?.values() ?? [])
