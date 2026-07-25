import { prisma } from "../../lib/prisma"
import safeRedis from "../../lib/redis"
import { io } from "../../realtime/socket"
import { Notification, Prisma } from "@prisma/client"
import { JsonValue } from "@prisma/client/runtime/library"
import { isUserOnline } from "../../lib/presence"
import { sendNotificationEmail } from "./email.service"

export class NotificationService {
	static async createNotification(data: {
		userId: string
		content: string
		metadata?: JsonValue
	}): Promise<Notification> {
		try {
			console.log(
				`Creating notification for user ${data.userId}: "${data.content}"`
			)

			const notification = await prisma.notification.create({
				data: {
					userId: data.userId,
					content: data.content,
					...(data.metadata !== undefined && data.metadata !== null
						? { metadata: data.metadata as Prisma.InputJsonValue }
						: {}),
				},
			})

			console.log(`Notification created with ID: ${notification.id}`)

			const fullNotification = {
				...notification,
				metadata: data.metadata || {},
			}

			try {
				await safeRedis.hSet(
					`notifications:${data.userId}`,
					notification.id,
					JSON.stringify(fullNotification)
				)
				console.log(`Notification stored in Redis for user ${data.userId}`)
			} catch (redisError) {
				console.error(`Redis error storing notification: ${redisError}`)
			}

			try {
				console.log(`Emitting notification to user:${data.userId}`)
				io.to(`user:${data.userId}`).emit("notification", fullNotification)
			} catch (socketError) {
				console.error(`Socket error when sending notification: ${socketError}`)
			}

			try {
				if (!isUserOnline(data.userId)) {
					const recipient = await prisma.user.findUnique({
						where: { id: data.userId },
						select: { email: true, name: true },
					})
					if (recipient?.email) {
						await sendNotificationEmail({
							to: recipient.email,
							name: recipient.name,
							content: data.content,
							metadata: data.metadata,
						})
					}
				}
			} catch (emailError) {
				console.error(`Email fallback error: ${emailError}`)
			}

			return notification
		} catch (error) {
			console.error("Error creating notification:", error)
			throw error
		}
	}

	static async createProjectNotification(data: {
		projectId: string
		content: string
		excludeUserId?: string
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

	static async getUserNotifications(userId: string): Promise<Notification[]> {
		try {
			const notificationKeys = await safeRedis.hKeys(`notifications:${userId}`)

			if (notificationKeys.length > 0) {
				const notificationValues = await safeRedis.hVals(
					`notifications:${userId}`
				)
				return notificationValues.map((value: string) => JSON.parse(value))
			}

			const notifications = await prisma.notification.findMany({
				where: {
					userId,
				},
				orderBy: {
					createdAt: "desc",
				},
			})

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

	static async markAsRead(
		notificationId: string,
		userId: string
	): Promise<Notification> {
		try {
			const notification = await prisma.notification.update({
				where: {
					id: notificationId,
					userId,
				},
				data: {
					read: true,
				},
			})

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
