// Simple script to test socket.io connections
const http = require("http")
const { Server } = require("socket.io")

// Create a simple HTTP server
const server = http.createServer()

// Create a Socket.IO server
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
})

// Socket.IO connection handler
io.on("connection", (socket) => {
	console.log("New client connected:", socket.id)

	// Join user to a test room
	socket.on("join", (userId) => {
		socket.join(`user:${userId}`)
		console.log(`User ${userId} joined room: user:${userId}`)

		// Send a confirmation
		socket.emit("connection_confirmed", {
			message: "Successfully connected to test notification service",
			userId: userId,
		})
	})

	// Test notification event
	socket.on("test_notification", ({ targetUserId }) => {
		console.log(`Sending test notification to user ${targetUserId}`)

		const testNotification = {
			id: `test-${Date.now()}`,
			userId: targetUserId,
			content: "This is a test notification from the test server",
			createdAt: new Date().toISOString(),
			read: false,
		}

		io.to(`user:${targetUserId}`).emit("notification", testNotification)
		console.log(`Test notification sent to user:${targetUserId}`)
	})

	socket.on("disconnect", (reason) => {
		console.log(`Client disconnected: ${socket.id}, reason: ${reason}`)
	})
})

// Start the server on a different port than the main app
const PORT = 3002
server.listen(PORT, () => {
	console.log(`Test Socket.IO server running on port ${PORT}`)
	console.log("To test:")
	console.log("1. Connect to ws://localhost:3002")
	console.log('2. Emit "join" event with a user ID')
	console.log(
		'3. Emit "test_notification" event with { targetUserId: "your-user-id" }'
	)
})
