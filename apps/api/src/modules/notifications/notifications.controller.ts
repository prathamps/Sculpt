import { Response } from "express"
import { AuthenticatedRequest } from "../../types"
import { respondWithError } from "../../lib/http"
import {
	NOTIFICATION_PAGE_SIZE,
	NotificationService,
} from "./notification.service"

const requireUserId = (req: AuthenticatedRequest, res: Response): string | null => {
	const userId = req.user?.id
	if (!userId) {
		res.status(401).json({ message: "Unauthorized" })
		return null
	}
	return userId
}

export class NotificationsController {
	static async getUserNotifications(req: AuthenticatedRequest, res: Response) {
		try {
			const userId = requireUserId(req, res)
			if (!userId) return

			const { page, pageSize } = res.locals.query as {
				page?: number
				pageSize?: number
			}

			const result = await NotificationService.getUserNotifications(userId, {
				page: page ?? 1,
				pageSize: pageSize ?? NOTIFICATION_PAGE_SIZE,
			})
			res.status(200).json(result)
		} catch (error) {
			respondWithError(res, error, "list notifications")
		}
	}

	static async markAsRead(req: AuthenticatedRequest, res: Response) {
		try {
			const userId = requireUserId(req, res)
			if (!userId) return

			const notification = await NotificationService.markAsRead(
				req.params.notificationId,
				userId
			)
			res.status(200).json(notification)
		} catch (error) {
			respondWithError(res, error, "mark notification read")
		}
	}

	static async markAllAsRead(req: AuthenticatedRequest, res: Response) {
		try {
			const userId = requireUserId(req, res)
			if (!userId) return

			const updated = await NotificationService.markAllAsRead(userId)
			res.status(200).json({ updated })
		} catch (error) {
			respondWithError(res, error, "mark all notifications read")
		}
	}
}
