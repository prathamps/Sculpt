import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import passport from "./lib/passport"
import cookieParser from "cookie-parser"
import authRoutes from "./routes/auth.routes"
import userRoutes from "./routes/users.routes"
import projectRoutes from "./routes/projects.routes"
import { imageRouter } from "./routes/images.routes"
import shareRoutes from "./routes/share.routes"
import notificationRoutes from "./routes/notifications.routes"
import commentRoutes from "./routes/comments.routes"
import adminRoutes from "./routes/admin.routes"
import path from "path"
import http from "http"
import { Server } from "socket.io"
import "./lib/redis" // Import Redis client to ensure connection
// import "./types/express"

dotenv.config()

const app = express()
const server = http.createServer(app)

// Configure Socket.io with CORS
const io = new Server(server, {
	cors: {
		origin: "http://localhost:3000",
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		credentials: true,
		allowedHeaders: ["Content-Type", "Authorization"],
	},
	transports: ["websocket", "polling"],
	connectTimeout: 60000, // Increase connection timeout to 60 seconds
	pingTimeout: 60000, // Increase ping timeout to 60 seconds (keep connections alive longer)
	pingInterval: 25000, // Check connection every 25 seconds
	allowEIO3: true, // Allow Engine.IO 3 compatibility
})

// Socket.io connection handler
io.on("connection", (socket) => {
	console.log("New client connected:", socket.id)

	// Join user to their own room for private notifications
	socket.on("join", (userId) => {
		if (userId) {
			socket.join(`user:${userId}`)
			console.log(`User ${userId} joined their room via socket ${socket.id}`)

			// Emit a connection confirmation event
			socket.emit("connection_confirmed", {
				message: "Successfully connected to notification service",
				userId: userId,
			})
		}
	})

	// Join project room for project-specific notifications
	socket.on("joinProject", (projectId) => {
		if (projectId) {
			socket.join(`project:${projectId}`)
			console.log(`Socket ${socket.id} joined project room: ${projectId}`)

			// Send confirmation back to client
			socket.emit("project_joined", {
				projectId,
				message: `Successfully joined project room ${projectId}`,
			})

			// Debug - list all rooms this socket is in
			const rooms = Array.from(socket.rooms).filter(
				(room) => room !== socket.id
			)
			console.log(`Socket ${socket.id} is now in rooms:`, rooms)
		} else {
			console.log(`Socket ${socket.id} attempted to join invalid project room`)
		}
	})

	// Join image version room for comment notifications
	socket.on("joinImageVersion", (imageVersionId) => {
		if (imageVersionId) {
			socket.join(`imageVersion:${imageVersionId}`)
			console.log(
				`Socket ${socket.id} joined image version room: ${imageVersionId}`
			)

			// Send confirmation back to client
			socket.emit("image_version_joined", {
				imageVersionId,
				message: `Successfully joined image version room ${imageVersionId}`,
			})

			// Debug - list all rooms this socket is in after joining
			const rooms = Array.from(socket.rooms).filter(
				(room) => room !== socket.id
			)
			console.log(
				`Socket ${socket.id} after joining image version is in rooms:`,
				rooms
			)
		} else {
			console.log(
				`Socket ${socket.id} attempted to join invalid image version room`
			)
		}
	})

	// Leave image version room
	socket.on("leaveImageVersion", (imageVersionId) => {
		if (imageVersionId) {
			socket.leave(`imageVersion:${imageVersionId}`)
			console.log(
				`Socket ${socket.id} left image version room: ${imageVersionId}`
			)

			// Debug - list all rooms this socket is in after leaving
			const rooms = Array.from(socket.rooms).filter(
				(room) => room !== socket.id
			)
			console.log(
				`Socket ${socket.id} after leaving image version is in rooms:`,
				rooms
			)
		}
	})

	// Handle debug/test events
	socket.on("test_notification", ({ targetUserId, projectId }) => {
		console.log(
			`Received test notification request for user ${targetUserId} in project ${projectId}`
		)

		if (targetUserId) {
			// Send direct notification test
			const testNotification = {
				id: `test-${Date.now()}`,
				userId: targetUserId,
				content: "This is a test direct notification",
				createdAt: new Date().toISOString(),
				read: false,
			}
			io.to(`user:${targetUserId}`).emit("notification", testNotification)
			console.log(`Emitted test notification to user:${targetUserId}`)
		}

		if (projectId) {
			// Send project notification test
			const testProjectUpdate = {
				type: "notification",
				content: "This is a test project notification",
				projectId: projectId,
				createdAt: new Date().toISOString(),
			}
			io.to(`project:${projectId}`).emit("project-update", testProjectUpdate)
			console.log(`Emitted test project notification to project:${projectId}`)
		}
	})

	socket.on("error", (error) => {
		console.error("Socket error:", error)
	})

	socket.on("disconnect", (reason) => {
		console.log(`Client disconnected: ${socket.id}, reason: ${reason}`)
	})
})

// Export io instance to use in other modules
export { io }

const corsOptions = {
	origin: "http://localhost:3000",
	credentials: true,
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(passport.initialize())

// Statically serve the 'uploads' directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/projects", projectRoutes)
app.use("/api/images", imageRouter)
app.use("/api/share", shareRoutes)
app.use("/api/notifications", notificationRoutes)
app.use("/api/comments", commentRoutes)
app.use("/api/admin", adminRoutes)

const port = process.env.PORT || 3001

server.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})
