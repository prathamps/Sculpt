"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { io, Socket } from "socket.io-client"
import { useAuth } from "@/context/AuthContext"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function SocketTest() {
	const { user } = useAuth()
	const [socket, setSocket] = useState<Socket | null>(null)
	const [connectionStatus, setConnectionStatus] = useState("Disconnected")
	const [notifications, setNotifications] = useState<any[]>([])
	const [comments, setComments] = useState<any[]>([])
	const [logs, setLogs] = useState<string[]>([])
	const [manualUserId, setManualUserId] = useState("")
	const [imageVersionId, setImageVersionId] = useState("test-image-id")
	const [connected, setConnected] = useState(false)
	const [messages, setMessages] = useState<string[]>([])
	const [socketId, setSocketId] = useState<string>("")
	const [error, setError] = useState<string>("")

	// Add a log entry with timestamp
	const addLog = useCallback((message: string) => {
		const timestampParts = new Date().toISOString().split("T")[1]?.split(".");
		const timestamp = timestampParts && timestampParts[0] ? timestampParts[0] : "00:00:00";
		setLogs((prev) => [`[${timestamp}] ${message}`, ...prev])
	}, [])
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	// Connect to socket server
	const connectSocket = useCallback(() => {
		const userId = user?.id || manualUserId

		if (!userId) {
			addLog("No user ID available - please enter a manual user ID")
			return
		}

		addLog(`Initializing socket connection for user ID: ${userId}...`)

		// Disconnect existing socket if any
		if (socket) {
			socket.disconnect()
			addLog("Disconnected existing socket connection")
		}

		try {
			const socketInstance = io(URI, {
				withCredentials: true,
				reconnectionAttempts: 3,
				timeout: 10000,
				transports: ["websocket", "polling"],
			})

			socketInstance.on("connect", () => {
				setConnected(true)
				setSocketId(socketInstance.id || "")
				addLog(`Connected! Socket ID: ${socketInstance.id || ""}`)

				// Join user room
				socketInstance.emit("join", userId)
				addLog(`Joined user room: ${userId}`)

				// Join test rooms
				socketInstance.emit("joinUser", "test-user")
				socketInstance.emit("joinProject", "test-project")
				socketInstance.emit("joinImageVersion", "test-image-version")
				addLog(
					"Joined test rooms: user:test-user, project:test-project, imageVersion:test-image-version"
				)
			})

			socketInstance.on("connect_error", (error) => {
				setConnectionStatus(`Error: ${error.message}`)
				addLog(`Connection error: ${error.message}`)
			})

			socketInstance.on("disconnect", (reason) => {
				setConnectionStatus(`Disconnected: ${reason}`)
				addLog(`Socket disconnected. Reason: ${reason}`)
			})

			socketInstance.on("notification", (notification) => {
				addLog(`Received notification: ${JSON.stringify(notification)}`)
				setNotifications((prev) => [notification, ...prev])
			})

			socketInstance.on("new-comment", (comment) => {
				addLog(`Received comment: ${JSON.stringify(comment)}`)
				setComments((prev) => [comment, ...prev])
			})

			setSocket(socketInstance)
		} catch (error) {
			addLog(
				`Error creating socket: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
			setConnectionStatus(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			)
		}
	}, [user, manualUserId, socket, addLog])

	// Initial connection with user id if available
	useEffect(() => {
		if (user?.id) {
			setManualUserId(user.id)
			connectSocket()
		}

		return () => {
			if (socket) {
				addLog("Cleaning up socket connection")
				socket.disconnect()
			}
		}
	}, [user, connectSocket, socket, addLog])

	const joinImageVersion = useCallback(() => {
		if (!socket) {
			addLog("Socket not connected. Connect first.")
			return
		}

		socket.emit("joinImageVersion", imageVersionId)
		addLog(`Requested to join image version: ${imageVersionId}`)
	}, [socket, imageVersionId, addLog])

	const testNotification = useCallback(() => {
		const userId = user?.id || manualUserId

		if (!userId) {
			addLog("Cannot request notification: No User ID available")
			return
		}

		addLog("Requesting test notification from server...")
		fetch(`${URI}/api/notifications/test`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ userId }),
		})
			.then((response) => {
				if (response.ok) {
					addLog("Test notification request successful")
				} else {
					addLog(`Test notification request failed: ${response.status}`)
				}
			})
			.catch((error) => {
				addLog(`Error requesting test notification: ${error.message}`)
			})
	}, [user, manualUserId, addLog])

	const sendTestNotification = async () => {
		try {
			addLog("Sending test notification request...")
			const response = await fetch(
				`${URI}/api/notifications/test`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
				}
			)

			if (response.ok) {
				addLog("Test notification request sent successfully")
			} else {
				const error = await response.text()
				addLog(`Failed to send test notification: ${error}`)
			}
		} catch (err: any) {
			addLog(`Error sending test notification: ${err.message}`)
		}
	}

	const sendTestComment = async () => {
		try {
			addLog("Sending test comment request...")
				const response = await fetch(`${URI}/api/comments/test`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			})

			if (response.ok) {
				addLog("Test comment request sent successfully")
			} else {
				const error = await response.text()
				addLog(`Failed to send test comment: ${error}`)
			}
		} catch (err: any) {
			addLog(`Error sending test comment: ${err.message}`)
		}
	}

	return (
		<div className="container mx-auto p-4">
			<Card>
				<CardHeader>
					<CardTitle>Socket.IO Test Page</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="mb-4">
						<div className="flex items-center gap-2 mb-4">
							<div
								className={`w-4 h-4 rounded-full ${
									connected ? "bg-green-500" : "bg-red-500"
								}`}
							></div>
							<span>
								{connected
									? `Connected (Socket ID: ${socketId})`
									: "Disconnected"}
							</span>
						</div>

						{error && (
							<div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
								{error}
							</div>
						)}

						<div className="flex gap-2 mb-4">
							<Button onClick={sendTestNotification}>
								Send Test Notification
							</Button>
							<Button onClick={sendTestComment}>Send Test Comment</Button>
						</div>

						<h3 className="font-semibold text-lg mb-2">Notifications:</h3>
						<div className="bg-gray-50 p-2 rounded mb-4 max-h-40 overflow-y-auto">
							{notifications.length === 0 ? (
								<p className="text-gray-500">No notifications received yet</p>
							) : (
								notifications.map((notification, i) => (
									<div
										key={i}
										className="bg-white p-2 mb-1 rounded border border-gray-200"
									>
										<p>{notification.content}</p>
										<p className="text-xs text-gray-500">
											{new Date(notification.createdAt).toLocaleTimeString()}
										</p>
									</div>
								))
							)}
						</div>

						<h3 className="font-semibold text-lg mb-2">Debug Log:</h3>
						<div className="bg-gray-100 p-2 rounded h-64 overflow-y-auto font-mono text-xs">
							{messages.map((msg, i) => (
								<div key={i} className="mb-1">
									{msg}
								</div>
							))}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
