import http from "http"
import { Server, Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { markOnline, markOffline, startPresenceHeartbeat } from "../lib/presence"
import { redisClient } from "../lib/redis"
import { isAllowedOrigin } from "../lib/cors"
import { resolveSocketUser, socketAuth, SocketUser } from "./socketAuth"
import {
	addViewer,
	updateViewer,
	removeViewer,
	getViewers,
	refreshViewerTtls,
} from "./viewerPresence"
import {
	canViewInternalComments,
	canViewVersion,
	isProjectMember,
} from "../modules/projects/access"
import { logger } from "../lib/logger"

export const io = new Server({
	cors: {
		origin: (origin, callback) =>
			isAllowedOrigin(origin ?? undefined)
				? callback(null, true)
				: callback(new Error("Not allowed by CORS")),
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		credentials: true,
		allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
	},
	transports: ["websocket", "polling"],
	connectTimeout: 60000,
	pingTimeout: 60000,
	pingInterval: 25000,
})

export const SESSION_REVALIDATION_INTERVAL_MS = 60000

const socketUser = (socket: Socket): SocketUser | null =>
	(socket.data.user as SocketUser | null) ?? null

const presenceUser = (user: SocketUser) => ({
	id: user.id,
	name: user.name,
	avatarUrl: user.avatarUrl,
})

const joinedVersions = (socket: Socket): Set<string> => {
	if (!socket.data.joinedVersions) socket.data.joinedVersions = new Set()
	return socket.data.joinedVersions as Set<string>
}

const joinedProjects = (socket: Socket): Set<string> => {
	if (!socket.data.joinedProjects) socket.data.joinedProjects = new Set()
	return socket.data.joinedProjects as Set<string>
}

const versionRoom = (imageVersionId: string): string =>
	`imageVersion:${imageVersionId}`

export const internalVersionRoom = (imageVersionId: string): string =>
	`imageVersion:${imageVersionId}:internal`

const viewersStillInRoom = (imageVersionId: string) =>
	io.to(versionRoom(imageVersionId))

export const guardedHandler =
	<TArgs extends unknown[]>(
		event: string,
		handler: (...args: TArgs) => Promise<void>
	) =>
	(...args: TArgs): Promise<void> =>
		handler(...args).catch((error) =>
			logger.error("socket handler failed", error, { event })
		)

const leaveVersionRoom = (socket: Socket, imageVersionId: string): void => {
	socket.leave(versionRoom(imageVersionId))
	socket.leave(internalVersionRoom(imageVersionId))
	joinedVersions(socket).delete(imageVersionId)
	removeViewer(imageVersionId, socket.id).catch((error) =>
		logger.error("Could not drop viewer presence", error, { imageVersionId })
	)
	viewersStillInRoom(imageVersionId).emit("presence:leave", {
		socketId: socket.id,
		imageVersionId,
	})
}

const leaveProjectRoom = (socket: Socket, projectId: string): void => {
	socket.leave(`project:${projectId}`)
	joinedProjects(socket).delete(projectId)
}

const resyncInternalRoom = async (
	socket: Socket,
	userId: string,
	imageVersionId: string
): Promise<void> => {
	const room = internalVersionRoom(imageVersionId)
	const allowed = await canViewInternalComments(userId, imageVersionId)
	if (allowed && !socket.rooms.has(room)) socket.join(room)
	if (!allowed && socket.rooms.has(room)) socket.leave(room)
}

export const revalidateSocketAccess = async (
	socket: Socket
): Promise<boolean> => {
	const user = await resolveSocketUser(socket)
	if (!user) {
		socket.emit("session_expired")
		socket.disconnect(true)
		return false
	}
	socket.data.user = user

	for (const projectId of Array.from(joinedProjects(socket))) {
		if (await isProjectMember(projectId, user.id)) continue
		leaveProjectRoom(socket, projectId)
		socket.emit("project_access_revoked", { projectId })
	}

	for (const imageVersionId of Array.from(joinedVersions(socket))) {
		if (!(await canViewVersion(user.id, imageVersionId))) {
			leaveVersionRoom(socket, imageVersionId)
			socket.emit("image_version_access_revoked", { imageVersionId })
			continue
		}
		await resyncInternalRoom(socket, user.id, imageVersionId)
	}

	return true
}

export const revalidateConnections = async (): Promise<void> => {
	for (const socket of Array.from(io.sockets.sockets.values())) {
		await revalidateSocketAccess(socket).catch((error) =>
			logger.error("Socket revalidation failed", error, {
				socketId: socket.id,
			})
		)
	}
}

const VIEWER_HEARTBEAT_MS = 45000

export const startViewerPresenceHeartbeat = (): NodeJS.Timeout => {
	const timer = setInterval(() => {
		refreshViewerTtls().catch((error) =>
			logger.error("Viewer presence heartbeat failed", error)
		)
	}, VIEWER_HEARTBEAT_MS)
	timer.unref()
	return timer
}

export const startSessionRevalidation = (): NodeJS.Timeout => {
	const timer = setInterval(() => {
		void revalidateConnections()
	}, SESSION_REVALIDATION_INTERVAL_MS)
	timer.unref()
	return timer
}

export const registerHandlers = (socket: Socket) => {
	socket.on("join", () => {
		const user = socketUser(socket)
		if (!user) return
		socket.join(`user:${user.id}`)
		socket.data.userId = user.id
		markOnline(user.id, socket.id).catch((e) =>
			logger.error("presence markOnline failed", e)
		)
		socket.emit("connection_confirmed", {
			message: "Successfully connected to notification service",
			userId: user.id,
		})
	})

	socket.on(
		"joinProject",
		guardedHandler("joinProject", async (projectId: string) => {
			if (!projectId || typeof projectId !== "string") return
			const user = socketUser(socket)
			if (!user || !(await isProjectMember(projectId, user.id))) {
				socket.emit("project_join_denied", { projectId })
				return
			}
			socket.join(`project:${projectId}`)
			joinedProjects(socket).add(projectId)
			socket.emit("project_joined", {
				projectId,
				message: `Successfully joined project room ${projectId}`,
			})
		})
	)

	socket.on(
		"joinImageVersion",
		guardedHandler("joinImageVersion", async (imageVersionId: string) => {
			if (!imageVersionId || typeof imageVersionId !== "string") return
			const user = socketUser(socket)
			if (!user || !(await canViewVersion(user.id, imageVersionId))) {
				socket.emit("image_version_join_denied", { imageVersionId })
				return
			}
			socket.join(versionRoom(imageVersionId))
			if (await canViewInternalComments(user.id, imageVersionId)) {
				socket.join(internalVersionRoom(imageVersionId))
			}
			joinedVersions(socket).add(imageVersionId)
			await addViewer(imageVersionId, socket.id, presenceUser(user))
			socket.emit("image_version_joined", {
				imageVersionId,
				message: `Successfully joined image version room ${imageVersionId}`,
			})
			socket.emit("presence:state", {
				imageVersionId,
				peers: await getViewers(imageVersionId),
			})
			socket.to(versionRoom(imageVersionId)).emit("presence:peer", {
				socketId: socket.id,
				imageVersionId,
				user: presenceUser(user),
				time: 0,
			})
		})
	)

	socket.on(
		"presence:update",
		guardedHandler(
			"presence:update",
			async (payload: { imageVersionId?: unknown; time?: unknown }) => {
				const user = socketUser(socket)
				const imageVersionId = payload?.imageVersionId
				const time = payload?.time
				if (
					!user ||
					typeof imageVersionId !== "string" ||
					typeof time !== "number" ||
					!Number.isFinite(time) ||
					time < 0
				) {
					return
				}
				if (!socket.rooms.has(versionRoom(imageVersionId))) return
				await updateViewer(imageVersionId, socket.id, time)
				socket.volatile.to(versionRoom(imageVersionId)).emit("presence:peer", {
					socketId: socket.id,
					imageVersionId,
					user: presenceUser(user),
					time,
				})
			}
		)
	)

	socket.on("leaveImageVersion", (imageVersionId: string) => {
		if (imageVersionId) leaveVersionRoom(socket, imageVersionId)
	})

	socket.on("error", (error) => {
		logger.error("socket error", error, { socketId: socket.id })
	})

	socket.on("disconnect", () => {
		for (const imageVersionId of Array.from(joinedVersions(socket))) {
			leaveVersionRoom(socket, imageVersionId)
		}
		const userId = socket.data.userId as string | undefined
		if (userId) {
			markOffline(userId, socket.id).catch((e) =>
				logger.error("presence markOffline failed", e)
			)
		}
	})
}

const attachRedisAdapter = async (): Promise<void> => {
	if (!redisClient.isReady) {
		logger.warn(
			"Socket.IO is running without the Redis adapter — realtime events stay local to this instance"
		)
		return
	}

	try {
		const subscriber = redisClient.duplicate()
		await subscriber.connect()
		io.adapter(createAdapter(redisClient, subscriber))
		logger.info("Socket.IO Redis adapter attached")
	} catch (error) {
		logger.error("Could not attach the Socket.IO Redis adapter", error)
	}
}

export const attachRealtime = async (server: http.Server): Promise<void> => {
	await attachRedisAdapter()
	io.use(socketAuth)
	io.on("connection", registerHandlers)
	io.attach(server)
	startPresenceHeartbeat()
	startViewerPresenceHeartbeat()
	startSessionRevalidation()
}
