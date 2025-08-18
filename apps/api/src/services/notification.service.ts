import { prisma } from "../lib/prisma"
import safeRedis from "../lib/redis"
import { io } from "../index"
import { Notification } from "@prisma/client"
import { JsonValue } from "@prisma/client/runtime/library"

export class NotificationService {
	// Create a notification and send it via Socket.io
	static async createNotification(data: {
		userId: string
		content: string
		metadata?: JsonValue
	}): Promise<Notification> {
		try {
			console.log(
				`Creating notification for user ${data.userId}: "${data.content}"`
			)

			// Create notification in database
			const notification = await prisma.notification.create({
				data: {
					userId: data.userId,
					content: data.content,
				},
			})

			console.log(`Notification created with ID: ${notification.id}`)

			// Prepare the full notification data to send
			const fullNotification = {
				...notification,
				metadata: data.metadata || {},
			}

			// Store notification in Redis for quick access
			try {
				await safeRedis.hSet(
					`notifications:${data.userId}`,
					notification.id,
					JSON.stringify(fullNotification)
				)
				console.log(`Notification stored in Redis for user ${data.userId}`)
			} catch (redisError) {
				console.error(`Redis error storing notification: ${redisError}`)
				// Continue execution - Redis is optional
			}

			// Send notification in real-time
			try {
				console.log(`Emitting notification to user:${data.userId}`)
				io.to(`user:${data.userId}`).emit("notification", fullNotification)
			} catch (socketError) {
				console.error(`Socket error when sending notification: ${socketError}`)
			}

			return notification
		} catch (error) {
			console.error("Error creating notification:", error)
			throw error
		}
	}

	// Create a project notification for all project members
	static async createProjectNotification(data: {
		projectId: string
		content: string
		excludeUserId?: string // Optional user to exclude (e.g., the user who triggered the notification)
		metadata?: JsonValue
	}): Promise<void> {
		try {
			console.log(
				`Creating project notification for project: ${data.projectId}`
			)
			console.log(`Content: ${data.content}`)
			if (data.excludeUserId) {
				console.log(`Excluding user: ${data.excludeUserId}`)
			}

			// Get all project members
			const members = await prisma.projectMember.findMany({
				where: {
					projectId: data.projectId,
					...(data.excludeUserId && { userId: { not: data.excludeUserId } }),
				},
				select: {
					userId: true,
				},
			})

			console.log(`Found ${members.length} project members to notify`)

			// Create notification for each member
			const notificationPromises = members.map((member) => {
				console.log(
					`Creating notification for project member: ${member.userId}`
				)
				return this.createNotification({
					userId: member.userId,
					content: data.content,
					metadata: {
						...(typeof data.metadata === 'object' && data.metadata !== null ? data.metadata : {}),
						projectId: data.projectId,
					},
				})
			})

			await Promise.all(notificationPromises)

			// Also send notification to project room for real-time updates
			console.log(`Emitting project-update to room project:${data.projectId}`)
			io.to(`project:${data.projectId}`).emit("project-update", {
				type: "notification",
				content: data.content,
				projectId: data.projectId,
				metadata: data.metadata || {},
			})
		} catch (error) {
			console.error("Error creating project notifications:", error)
			throw error
		}
	}

	// Get all notifications for a user
	static async getUserNotifications(userId: string): Promise<Notification[]> {
		try {
			// Try to get notifications from Redis first
			const notificationKeys = await safeRedis.hKeys(`notifications:${userId}`)

			if (notificationKeys.length > 0) {
				const notificationValues = await safeRedis.hVals(
					`notifications:${userId}`
				)
				return notificationValues.map((value: string) => JSON.parse(value))
			}

			// Fall back to database if Redis doesn't have the data
			const notifications = await prisma.notification.findMany({
				where: {
					userId,
				},
				orderBy: {
					createdAt: "desc",
				},
			})

			// Store in Redis for future requests
			const notificationsObject: Record<string, string> = {}
			notifications.forEach((notification) => {
				notificationsObject[notification.id] = JSON.stringify(notification)
			})

			if (Object.keys(notificationsObject).length > 0) {
				await safeRedis.hSet(`notifications:${userId}`, notificationsObject)
			}

			return notifications
		} catch (error) {
			console.error("Error fetching user notifications:", error)
			throw error
		}
	}

	// Mark a notification as read
	static async markAsRead(
		notificationId: string,
		userId: string
	): Promise<Notification> {
		try {
			const notification = await prisma.notification.update({
				where: {
					id: notificationId,
					userId, // Ensure the notification belongs to this user
				},
				data: {
					read: true,
				},
			})

			// Update in Redis
			const existingNotification = await safeRedis.hGet(
				`notifications:${userId}`,
				notificationId
			)
			if (existingNotification) {
				const parsed = JSON.parse(
					Buffer.isBuffer(existingNotification)
						? existingNotification.toString()
						: existingNotification
				)
				await safeRedis.hSet(
					`notifications:${userId}`,
					notificationId,
					JSON.stringify({ ...parsed, read: true })
				)
			}

			return notification
		} catch (error) {
			console.error("Error marking notification as read:", error)
			throw error
		}
	}

	// Mark all notifications as read for a user
	static async markAllAsRead(userId: string): Promise<void> {
		try {
			await prisma.notification.updateMany({
				where: {
					userId,
					read: false,
				},
				data: {
					read: true,
				},
			})

			// Update Redis
			const notificationKeys = await safeRedis.hKeys(`notifications:${userId}`)
			if (notificationKeys.length > 0) {
				for (const key of notificationKeys) {
					const existingNotification = await safeRedis.hGet(
						`notifications:${userId}`,
						key
					)
					if (existingNotification) {
						const parsed = JSON.parse(
							Buffer.isBuffer(existingNotification)
								? existingNotification.toString()
								: existingNotification
						)
						await safeRedis.hSet(
							`notifications:${userId}`,
							key,
							JSON.stringify({ ...parsed, read: true })
						)
					}
				}
			}
		} catch (error) {
			console.error("Error marking all notifications as read:", error)
			throw error
		}
	}
}
