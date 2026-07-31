import { prisma } from "../../lib/prisma"
import { io } from "../../realtime/socket"
import { Notification, Prisma } from "@prisma/client"
import { JsonValue } from "@prisma/client/runtime/library"
import { isUserOnline } from "../../lib/presence"
import { logger } from "../../lib/logger"
import { sendNotificationEmail } from "./email.service"

export const NOTIFICATION_PAGE_SIZE = 30

interface NotificationInput {
	userId: string
	content: string
	metadata?: JsonValue
}

interface PageRequest {
	page: number
	pageSize: number
}

const asInputJson = (
	metadata?: JsonValue
): { metadata: Prisma.InputJsonValue } | Record<string, never> =>
	metadata !== undefined && metadata !== null
		? { metadata: metadata as Prisma.InputJsonValue }
		: {}

const emailOfflineRecipient = async (
	input: NotificationInput
): Promise<void> => {
	if (await isUserOnline(input.userId)) return

	const recipient = await prisma.user.findUnique({
		where: { id: input.userId },
		select: { email: true, name: true, emailNotifications: true },
	})

	if (!recipient?.email || !recipient.emailNotifications) return

	await sendNotificationEmail({
		to: recipient.email,
		name: recipient.name,
		content: input.content,
		metadata: input.metadata,
	})
}

export class NotificationService {
	static async createNotification(
		data: NotificationInput
	): Promise<Notification> {
		const notification = await prisma.notification.create({
			data: {
				userId: data.userId,
				content: data.content,
				...asInputJson(data.metadata),
			},
		})

		io.to(`user:${data.userId}`).emit("notification", {
			...notification,
			metadata: data.metadata ?? {},
		})

		await emailOfflineRecipient(data).catch((error) =>
			logger.error("Offline notification email failed", error)
		)

		return notification
	}

	static async createProjectNotification(data: {
		projectId: string
		content: string
		excludeUserIds?: string[]
		metadata?: JsonValue
	}): Promise<void> {
		const excluded = data.excludeUserIds?.filter(Boolean) ?? []
		const members = await prisma.projectMember.findMany({
			where: {
				projectId: data.projectId,
				...(excluded.length > 0 && { userId: { notIn: excluded } }),
			},
			select: { userId: true },
		})

		const metadata = {
			...(typeof data.metadata === "object" && data.metadata !== null
				? data.metadata
				: {}),
			projectId: data.projectId,
		}

		await Promise.all(
			members.map((member) =>
				this.createNotification({
					userId: member.userId,
					content: data.content,
					metadata,
				}).catch((error) =>
					logger.error("Failed to notify project member", error, {
						projectId: data.projectId,
					})
				)
			)
		)

		io.to(`project:${data.projectId}`).emit("project-update", {
			type: "notification",
			content: data.content,
			projectId: data.projectId,
			metadata: data.metadata ?? {},
		})
	}

	static async getUserNotifications(
		userId: string,
		page: PageRequest = { page: 1, pageSize: NOTIFICATION_PAGE_SIZE }
	): Promise<{
		notifications: Notification[]
		total: number
		unread: number
		page: number
		pageSize: number
	}> {
		const [notifications, total, unread] = await Promise.all([
			prisma.notification.findMany({
				where: { userId },
				orderBy: { createdAt: "desc" },
				skip: (page.page - 1) * page.pageSize,
				take: page.pageSize,
			}),
			prisma.notification.count({ where: { userId } }),
			prisma.notification.count({ where: { userId, read: false } }),
		])

		return {
			notifications,
			total,
			unread,
			page: page.page,
			pageSize: page.pageSize,
		}
	}

	static async markAsRead(
		notificationId: string,
		userId: string
	): Promise<Notification> {
		return prisma.notification.update({
			where: { id: notificationId, userId },
			data: { read: true },
		})
	}

	static async markAllAsRead(userId: string): Promise<number> {
		const { count } = await prisma.notification.updateMany({
			where: { userId, read: false },
			data: { read: true },
		})
		return count
	}
}
