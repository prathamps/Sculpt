import express from "express"
import { NotificationsController } from "./notifications.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { requireScope } from "../../middleware/scope.middleware"
import { validateQuery } from "../../middleware/validate.middleware"
import { paginationSchema } from "../../lib/pagination"

const router = express.Router()

router.use(authenticateJWT)

router.get(
	"/",
	requireScope("sculpt:read"),
	validateQuery(paginationSchema),
	NotificationsController.getUserNotifications
)
router.put(
	"/read-all",
	requireScope("sculpt:feedback"),
	NotificationsController.markAllAsRead
)
router.put(
	"/:notificationId/read",
	requireScope("sculpt:feedback"),
	NotificationsController.markAsRead
)

export default router
