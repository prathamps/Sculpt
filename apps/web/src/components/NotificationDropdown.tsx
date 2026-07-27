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
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { toast } from "sonner"

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
	const { socket, isConnected, reconnectCount } = useSocket()
	const router = useRouter()
	const [notifications, setNotifications] = useState<Notification[]>([])
	const [hasUnread, setHasUnread] = useState(false)
	const [isOpen, setIsOpen] = useState(false)

	useEffect(() => {
		if (!user) return

		const fetchNotifications = async () => {
			try {
				const page = await api.get<{
					notifications: Notification[]
					unread: number
				}>("/api/notifications")
				setNotifications(page.notifications)
				setHasUnread(page.unread > 0)
			} catch {
				/* the bell simply stays empty until the next poll or socket event */
			}
		}

		void fetchNotifications()
	}, [user, reconnectCount])

	useEffect(() => {
		if (!socket || !isConnected || !user) return

		const handleNotification = (notification: Notification) => {
			setNotifications((prev) => {
				if (prev.some((n) => n.id === notification.id)) {
					return prev
				}
				return [notification, ...prev]
			})
			setHasUnread(true)
		}

		const handleProjectUpdate = (data: {
			type?: string
			content: string
			metadata?: Notification["metadata"]
		}) => {
			if (data.type === "notification") {
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
			const updatedNotifications = notifications.map((n) =>
				n.id === notification.id ? { ...n, read: true } : n
			)
			setNotifications(updatedNotifications)
			setHasUnread(updatedNotifications.some((n) => !n.read))

			if (notification.metadata) {
				const { projectId, imageId } = notification.metadata
				if (projectId && imageId) {
					router.push(`/project/${projectId}/image/${imageId}`)
				} else if (projectId) {
					router.push(`/project/${projectId}`)
				}
			}

			if (!notification.id.startsWith("project-")) {
				await api.put(`/api/notifications/${notification.id}/read`)
			}
		} catch {
			/* navigation already happened; the unread badge self-corrects on reload */
		}
	}

	const markAllAsRead = async () => {
		try {
			await api.put("/api/notifications/read-all")
			setNotifications(notifications.map((n) => ({ ...n, read: true })))
			setHasUnread(false)
		} catch (error) {
			toast.error(describeError(error, "Could not mark notifications as read."))
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
