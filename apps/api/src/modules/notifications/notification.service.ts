import { prisma } from "../../lib/prisma"
import { io } from "../../realtime/socket"
import { Notification, Prisma, ProjectRole } from "@prisma/client"
import { JsonValue } from "@prisma/client/runtime/library"
import { isUserOnline } from "../../lib/presence"
import { sendNotificationEmail } from "./email.service"
import { wantsEmailFor } from "./notification-preferences"
import { createDeliveryQueue } from "./notification-queue"

export const NOTIFICATION_PAGE_SIZE = 30

interface NotificationInput {
	userId: string
	content: string
	metadata?: JsonValue
}

interface ProjectNotificationInput {
	projectId: string
	content: string
	excludeUserIds?: string[]
	onlyRoles?: ProjectRole[]
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

const announce = (notification: Notification, metadata?: JsonValue): void => {
	io.to(`user:${notification.userId}`).emit("notification", {
		...notification,
		metadata: metadata ?? notification.metadata ?? {},
	})
}

const deliverEmail = async (input: NotificationInput): Promise<void> => {
	if (await isUserOnline(input.userId)) return

	const recipient = await prisma.user.findUnique({
		where: { id: input.userId },
		select: {
			email: true,
			name: true,
			emailNotifications: true,
			emailOnMention: true,
			emailOnComment: true,
			emailOnReply: true,
			emailOnReview: true,
		},
	})

	if (!recipient?.email) return
	if (!wantsEmailFor(recipient, input.metadata)) return

	await sendNotificationEmail({
		to: recipient.email,
		name: recipient.name,
		content: input.content,
		metadata: input.metadata,
	})
}

const emailQueue = createDeliveryQueue<NotificationInput>({
	name: "notification-email",
	run: deliverEmail,
})

const fanOutProjectNotification = async (
	input: ProjectNotificationInput
): Promise<void> => {
	const excluded = input.excludeUserIds?.filter(Boolean) ?? []
	const members = await prisma.projectMember.findMany({
		where: {
			projectId: input.projectId,
			...(excluded.length > 0 && { userId: { notIn: excluded } }),
			...(input.onlyRoles && { role: { in: input.onlyRoles } }),
		},
		select: { userId: true },
	})

	if (members.length === 0) return

	const metadata = {
		...(typeof input.metadata === "object" && input.metadata !== null
			? input.metadata
			: {}),
		projectId: input.projectId,
	}

	const created = await prisma.notification.createManyAndReturn({
		data: members.map((member) => ({
			userId: member.userId,
			content: input.content,
			metadata: metadata as Prisma.InputJsonValue,
		})),
	})

	for (const notification of created) {
		announce(notification, metadata)
		emailQueue.enqueue({
			userId: notification.userId,
			content: input.content,
			metadata,
		})
	}
}

const projectQueue = createDeliveryQueue<ProjectNotificationInput>({
	name: "notification-fanout",
	concurrency: 1,
	run: fanOutProjectNotification,
})

export const notificationQueueDepth = (): number =>
	emailQueue.depth() + projectQueue.depth()

export const notificationQueueDrained = async (): Promise<void> => {
	await projectQueue.drained()
	await emailQueue.drained()
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

		announce(notification, data.metadata)
		emailQueue.enqueue(data)

		return notification
	}

	static createProjectNotification(data: ProjectNotificationInput): void {
		projectQueue.enqueue(data)

		if (data.onlyRoles) return

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
