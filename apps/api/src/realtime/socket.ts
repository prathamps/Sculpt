import http from "http"
import { Server, Socket } from "socket.io"
import { markOnline, markOffline } from "../lib/presence"
import { isAllowedOrigin } from "../lib/cors"

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

const registerHandlers = (socket: Socket) => {
	socket.on("join", (userId: string) => {
		if (!userId) return
		socket.join(`user:${userId}`)
		socket.data.userId = userId
		markOnline(userId, socket.id).catch((e) =>
			console.error("presence markOnline error", e)
		)
		socket.emit("connection_confirmed", {
			message: "Successfully connected to notification service",
			userId,
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

	socket.on("joinImageVersion", (imageVersionId: string) => {
		if (!imageVersionId) return
		socket.join(`imageVersion:${imageVersionId}`)
		socket.emit("image_version_joined", {
			imageVersionId,
			message: `Successfully joined image version room ${imageVersionId}`,
		})
	})

	socket.on("leaveImageVersion", (imageVersionId: string) => {
		if (imageVersionId) socket.leave(`imageVersion:${imageVersionId}`)
	})

	socket.on("error", (error) => {
		console.error("Socket error:", error)
	})

	socket.on("disconnect", () => {
		const userId = socket.data.userId as string | undefined
		if (userId) {
			markOffline(userId, socket.id).catch((e) =>
				console.error("presence markOffline error", e)
			)
		}
	})
}

export const attachRealtime = (server: http.Server): void => {
	io.on("connection", registerHandlers)
	io.attach(server)
}
