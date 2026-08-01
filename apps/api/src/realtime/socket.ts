import http from "http"
import { Server, Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { markOnline, markOffline, startPresenceHeartbeat } from "../lib/presence"
import { redisClient } from "../lib/redis"
import { isAllowedOrigin } from "../lib/cors"
import { socketAuth, SocketUser } from "./socketAuth"
import {
	addViewer,
	updateViewer,
	removeViewer,
	getViewers,
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
	allowEIO3: true,
})

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
	removeViewer(imageVersionId, socket.id)
	viewersStillInRoom(imageVersionId).emit("presence:leave", {
		socketId: socket.id,
		imageVersionId,
	})
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
			addViewer(imageVersionId, socket.id, presenceUser(user))
			socket.emit("image_version_joined", {
				imageVersionId,
				message: `Successfully joined image version room ${imageVersionId}`,
			})
			socket.emit("presence:state", {
				imageVersionId,
				peers: getViewers(imageVersionId),
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
		(payload: { imageVersionId?: unknown; time?: unknown }) => {
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
			updateViewer(imageVersionId, socket.id, time)
			socket.volatile.to(versionRoom(imageVersionId)).emit("presence:peer", {
				socketId: socket.id,
				imageVersionId,
				user: presenceUser(user),
				time,
			})
		}
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
}
