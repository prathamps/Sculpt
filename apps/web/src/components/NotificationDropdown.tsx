"use client"

import { useState, useEffect } from "react"
import { Bell } from "lucide-react"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

// API and socket constants
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface Notification {
	id: string
	content: string
	read: boolean
	userId: string
	createdAt: string
	metadata?: {
		projectId?: string
		imageId?: string
		imageVersionId?: string
		commentId?: string
		type?: string
	}
}

export function NotificationDropdown() {
	const { user } = useAuth()
	const { socket, isConnected } = useSocket()
	const router = useRouter()
	const [notifications, setNotifications] = useState<Notification[]>([])
	const [hasUnread, setHasUnread] = useState(false)
	const [isOpen, setIsOpen] = useState(false)

	// Fetch initial notifications
	useEffect(() => {
		if (!user) return

		const fetchNotifications = async () => {
			try {
				const response = await fetch(`${API_URL}/api/notifications`, {
					credentials: "include",
				})

				if (response.ok) {
					const data = await response.json()
					setNotifications(data)
					setHasUnread(data.some((n: Notification) => !n.read))
				}
			} catch (error) {
				console.error("Failed to fetch notifications:", error)
			}
		}

		fetchNotifications()
	}, [user])

	// Listen for socket events
	useEffect(() => {
		if (!socket || !isConnected || !user) return

		console.log("Setting up notification listeners for user", user.id)

		const handleNotification = (notification: Notification) => {
			console.log("New notification received:", notification)
			setNotifications((prev) => {
				// Check if notification already exists to prevent duplicates
				if (prev.some((n) => n.id === notification.id)) {
					return prev
				}
				return [notification, ...prev]
			})
			setHasUnread(true)
		}

		const handleProjectUpdate = (data: any) => {
			if (data.type === "notification") {
				console.log("Project notification received:", data)
				const notification: Notification = {
					id: `project-${Date.now()}`,
					content: data.content,
					userId: user.id,
					read: false,
					createdAt: new Date().toISOString(),
					metadata: data.metadata || {},
				}
				setNotifications((prev) => [notification, ...prev])
				setHasUnread(true)
			}
		}

		socket.on("notification", handleNotification)
		socket.on("project-update", handleProjectUpdate)

		return () => {
			console.log("Removing notification listeners")
			socket.off("notification", handleNotification)
			socket.off("project-update", handleProjectUpdate)
		}
	}, [socket, isConnected, user])

	const handleNotificationClick = async (notification: Notification) => {
		try {
			// Mark as read locally first for responsiveness
			const updatedNotifications = notifications.map((n) =>
				n.id === notification.id ? { ...n, read: true } : n
			)
			setNotifications(updatedNotifications)
			setHasUnread(updatedNotifications.some((n) => !n.read))

			// Navigate to the relevant page
			if (notification.metadata) {
				const { projectId, imageId } = notification.metadata
				if (projectId && imageId) {
					router.push(`/project/${projectId}/image/${imageId}`)
				} else if (projectId) {
					router.push(`/project/${projectId}`)
				}
			}

			// Call API to mark as read
			if (!notification.id.startsWith("project-")) {
				await fetch(`${API_URL}/api/notifications/${notification.id}/read`, {
					method: "PUT",
					credentials: "include",
				})
			}
		} catch (error) {
			console.error("Failed to mark notification as read:", error)
		}
	}

	const markAllAsRead = async () => {
		try {
			await fetch(`${API_URL}/api/notifications/read-all`, {
				method: "PUT",
				credentials: "include",
			})
			setNotifications(notifications.map((n) => ({ ...n, read: true })))
			setHasUnread(false)
		} catch (error) {
			console.error("Failed to mark all notifications as read:", error)
		}
	}

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative"
					aria-label="Notifications"
				>
					<Bell className="h-5 w-5" />
					{hasUnread && (
						<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				<div className="flex items-center justify-between p-2">
					<DropdownMenuLabel>Notifications</DropdownMenuLabel>
					{notifications.some((n) => !n.read) && (
						<Button
							variant="ghost"
							size="sm"
							className="h-8 text-xs"
							onClick={markAllAsRead}
						>
							Mark all as read
						</Button>
					)}
				</div>
				<DropdownMenuSeparator />
				<div className="max-h-80 overflow-y-auto">
					{notifications.length > 0 ? (
						notifications.map((notification) => (
							<div key={notification.id}>
								<DropdownMenuItem
									className={cn(
										"flex cursor-pointer flex-col items-start p-3",
										!notification.read && "bg-muted/50"
									)}
									onClick={() => handleNotificationClick(notification)}
								>
									<p className="text-sm">{notification.content}</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{new Date(notification.createdAt).toLocaleString()}
									</p>
								</DropdownMenuItem>
								<Separator />
							</div>
						))
					) : (
						<div className="p-4 text-center text-sm text-muted-foreground">
							No notifications
						</div>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
