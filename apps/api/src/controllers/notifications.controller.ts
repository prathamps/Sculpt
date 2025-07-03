import { Request, Response } from "express"
import { NotificationService } from "../services/notification.service"
import { io } from "../index"
import { User } from "@prisma/client"

interface AuthenticatedRequest extends Request {
	user?: User
}

export class NotificationsController {
	// Get all notifications for the logged-in user
	static async getUserNotifications(req: AuthenticatedRequest, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: "Unauthorized" })
			}

			const notifications = await NotificationService.getUserNotifications(
				userId
			)
			return res.status(200).json(notifications)
		} catch (error) {
			console.error("Error fetching notifications:", error)
			return res.status(500).json({ message: "Internal server error" })
		}
	}

	// Mark a notification as read
	static async markAsRead(req: AuthenticatedRequest, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: "Unauthorized" })
			}

			const notificationId = req.params.notificationId || req.params.id
			if (!notificationId) {
				return res.status(400).json({ message: "Notification ID is required" })
			}

			const notification = await NotificationService.markAsRead(
				notificationId,
				userId
			)
			return res.status(200).json(notification)
		} catch (error) {
			console.error("Error marking notification as read:", error)
			return res.status(500).json({ message: "Internal server error" })
		}
	}

	// Mark all notifications as read for the logged-in user
	static async markAllAsRead(req: AuthenticatedRequest, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: "Unauthorized" })
			}

			await NotificationService.markAllAsRead(userId)
			return res
				.status(200)
				.json({ message: "All notifications marked as read" })
		} catch (error) {
			console.error("Error marking all notifications as read:", error)
			return res.status(500).json({ message: "Internal server error" })
		}
	}

	// Test notification endpoint
	static async sendTestNotification(req: AuthenticatedRequest, res: Response) {
		try {
			const user = req.user

			if (!user) {
				return res.status(401).send("Unauthorized: Login required")
			}

			console.log(`Creating test notification for user ${user.id}`)

			// Create a test notification
			const testNotification = {
				id: `test-${Date.now()}`,
				userId: user.id,
				content: "This is a test notification",
				createdAt: new Date(),
				read: false,
				metadata: {
					type: "test",
					projectId: "test-project-id",
					imageId: "test-image-id",
				},
			}

			// Emit directly via Socket.IO
			io.to(`user:${user.id}`).emit("notification", testNotification)

			console.log(`Test notification emitted to user:${user.id}`)

			return res.status(200).json({ message: "Test notification sent" })
		} catch (error) {
			console.error("Error sending test notification:", error)
			return res.status(500).send("Server error")
		}
	}
}
