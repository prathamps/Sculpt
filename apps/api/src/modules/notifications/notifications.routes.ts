import express from "express"
import { NotificationsController } from "./notifications.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { validateQuery } from "../../middleware/validate.middleware"
import { paginationSchema } from "../../lib/pagination"

const router = express.Router()

router.use(authenticateJWT)

router.get(
	"/",
	validateQuery(paginationSchema),
	NotificationsController.getUserNotifications
)
router.put("/read-all", NotificationsController.markAllAsRead)
router.put("/:notificationId/read", NotificationsController.markAsRead)

export default router
