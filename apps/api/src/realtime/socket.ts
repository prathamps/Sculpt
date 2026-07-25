import http from "http"
import { Server, Socket } from "socket.io"
import { markOnline, markOffline } from "../lib/presence"
import { isAllowedOrigin } from "../lib/cors"
import { socketAuth, SocketUser } from "./socketAuth"
import {
	addViewer,
	updateViewer,
	removeViewer,
	getViewers,
} from "./viewerPresence"
import { canViewVersion } from "../modules/projects/access"

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

const viewersStillInRoom = (imageVersionId: string) =>
	io.to(versionRoom(imageVersionId))

const leaveVersionRoom = (socket: Socket, imageVersionId: string): void => {
	socket.leave(versionRoom(imageVersionId))
	joinedVersions(socket).delete(imageVersionId)
	removeViewer(imageVersionId, socket.id)
	viewersStillInRoom(imageVersionId).emit("presence:leave", {
		socketId: socket.id,
		imageVersionId,
	})
}

const registerHandlers = (socket: Socket) => {
	socket.on("join", (userId: string) => {
		const id = socketUser(socket)?.id ?? userId
		if (!id) return
		socket.join(`user:${id}`)
		socket.data.userId = id
		markOnline(id, socket.id).catch((e) =>
			console.error("presence markOnline error", e)
		)
		socket.emit("connection_confirmed", {
			message: "Successfully connected to notification service",
			userId: id,
		})
	})

	socket.on("joinProject", (projectId: string) => {
		if (!projectId) return
		socket.join(`project:${projectId}`)
		socket.emit("project_joined", {
			projectId,
			message: `Successfully joined project room ${projectId}`,
		})
	})

	socket.on("joinImageVersion", async (imageVersionId: string) => {
		if (!imageVersionId || typeof imageVersionId !== "string") return
		const user = socketUser(socket)
		if (!user || !(await canViewVersion(user.id, imageVersionId))) {
			socket.emit("image_version_join_denied", { imageVersionId })
			return
		}
		socket.join(versionRoom(imageVersionId))
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
		console.error("Socket error:", error)
	})

	socket.on("disconnect", () => {
		for (const imageVersionId of Array.from(joinedVersions(socket))) {
			leaveVersionRoom(socket, imageVersionId)
		}
		const userId = socket.data.userId as string | undefined
		if (userId) {
			markOffline(userId, socket.id).catch((e) =>
				console.error("presence markOffline error", e)
			)
		}
	})
}

export const attachRealtime = (server: http.Server): void => {
	io.use(socketAuth)
	io.on("connection", registerHandlers)
	io.attach(server)
}
