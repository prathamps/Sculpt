import express from "express"
import { NotificationsController } from "./notifications.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"

const router = express.Router()

router.post("/test", NotificationsController.sendTestNotification)

router.use(authenticateJWT)

router.get("/", NotificationsController.getUserNotifications)

router.put("/:notificationId/read", NotificationsController.markAsRead)

router.put("/read-all", NotificationsController.markAllAsRead)

export default router
