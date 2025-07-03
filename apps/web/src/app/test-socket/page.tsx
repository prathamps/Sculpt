"use client"

import { useState, useEffect, useRef } from "react"
import { io, Socket } from "socket.io-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function TestSocketPage() {
	const [connected, setConnected] = useState(false)
	const [userId, setUserId] = useState("")
	const [targetUserId, setTargetUserId] = useState("")
	const [projectId, setProjectId] = useState("")
	const [notifications, setNotifications] = useState<any[]>([])
	const [logs, setLogs] = useState<string[]>([])
	const socketRef = useRef<Socket | null>(null)

	// Function to add a log message
	const addLog = (message: string) => {
		setLogs((prev) => [
			...prev,
			`${new Date().toLocaleTimeString()}: ${message}`,
		])
	}

	// Connect to socket
	const connect = () => {
		if (!userId) {
			addLog("Please enter a user ID")
			return
		}

		try {
			// Close any existing connection
			if (socketRef.current) {
				socketRef.current.disconnect()
			}

			addLog(`Attempting to connect as user: ${userId}`)

			// Connect to the main server
			const socket = io("http://localhost:3001", {
				withCredentials: true,
				reconnectionAttempts: 5,
				reconnectionDelay: 1000,
				timeout: 10000,
			})

			socket.on("connect", () => {
				addLog(`Socket connected with ID: ${socket.id}`)
				setConnected(true)
				socketRef.current = socket

				// Join user room
				socket.emit("join", userId)
				addLog(`Requested to join user room: ${userId}`)
			})

			socket.on("connection_confirmed", (data) => {
				addLog(`Connection confirmed: ${JSON.stringify(data)}`)
			})

			socket.on("notification", (notification) => {
				addLog(`Received notification: ${JSON.stringify(notification)}`)
				setNotifications((prev) => [notification, ...prev])
			})

			socket.on("project-update", (data) => {
				addLog(`Received project update: ${JSON.stringify(data)}`)
				if (data.type === "notification") {
					setNotifications((prev) => [
						{
							id: `project-${Date.now()}`,
							content: data.content,
							createdAt: data.createdAt,
							read: false,
							metadata: data.metadata || {},
						},
						...prev,
					])
				}
			})

			socket.on("disconnect", (reason) => {
				addLog(`Socket disconnected: ${reason}`)
				setConnected(false)
			})

			socket.on("connect_error", (error) => {
				addLog(`Connection error: ${error.message}`)
				setConnected(false)
			})

			socketRef.current = socket
		} catch (error: any) {
			addLog(`Error: ${error.message}`)
		}
	}

	// Disconnect from socket
	const disconnect = () => {
		if (socketRef.current) {
			socketRef.current.disconnect()
			socketRef.current = null
			addLog("Socket disconnected manually")
			setConnected(false)
		}
	}

	// Join project room
	const joinProject = () => {
		if (!socketRef.current || !connected) {
			addLog("Socket not connected")
			return
		}

		if (!projectId) {
			addLog("Please enter a project ID")
			return
		}

		socketRef.current.emit("joinProject", projectId)
		addLog(`Requested to join project room: ${projectId}`)
	}

	// Send test notification
	const sendTestNotification = () => {
		if (!socketRef.current || !connected) {
			addLog("Socket not connected")
			return
		}

		if (!targetUserId) {
			addLog("Please enter a target user ID")
			return
		}

		socketRef.current.emit("test_notification", {
			targetUserId,
			projectId: projectId || undefined,
		})
		addLog(`Sent test notification request for user: ${targetUserId}`)
	}

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (socketRef.current) {
				socketRef.current.disconnect()
			}
		}
	}, [])

	return (
		<div className="container mx-auto p-4">
			<h1 className="text-2xl font-bold mb-4">Socket.IO Test Page</h1>

			<div className="grid gap-4 mb-8">
				<div className="flex gap-2">
					<Input
						placeholder="Your User ID"
						value={userId}
						onChange={(e) => setUserId(e.target.value)}
						disabled={connected}
					/>
					{!connected ? (
						<Button onClick={connect}>Connect</Button>
					) : (
						<Button onClick={disconnect} variant="destructive">
							Disconnect
						</Button>
					)}
				</div>

				<div className="flex gap-2">
					<Input
						placeholder="Project ID"
						value={projectId}
						onChange={(e) => setProjectId(e.target.value)}
						disabled={!connected}
					/>
					<Button onClick={joinProject} disabled={!connected}>
						Join Project
					</Button>
				</div>

				<div className="flex gap-2">
					<Input
						placeholder="Target User ID"
						value={targetUserId}
						onChange={(e) => setTargetUserId(e.target.value)}
						disabled={!connected}
					/>
					<Button onClick={sendTestNotification} disabled={!connected}>
						Send Test Notification
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="border rounded p-4">
					<h2 className="text-xl font-semibold mb-2">Logs</h2>
					<div className="h-80 overflow-y-auto bg-gray-100 dark:bg-gray-800 p-2 rounded">
						{logs.map((log, i) => (
							<div key={i} className="text-sm mb-1">
								{log}
							</div>
						))}
					</div>
				</div>

				<div className="border rounded p-4">
					<h2 className="text-xl font-semibold mb-2">Notifications</h2>
					<div className="h-80 overflow-y-auto">
						{notifications.length > 0 ? (
							notifications.map((notification, i) => (
								<div key={i} className="border-b p-2 mb-2">
									<div className="font-medium">{notification.content}</div>
									<div className="text-sm text-gray-500">
										{new Date(notification.createdAt).toLocaleString()}
									</div>
								</div>
							))
						) : (
							<div className="text-center text-gray-500 p-4">
								No notifications yet
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
