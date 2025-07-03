import express from "express"
import { NotificationsController } from "../controllers/notifications.controller"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = express.Router()

// Test endpoint (dev only) - no auth required for testing
router.post("/test", NotificationsController.sendTestNotification)

// All other routes require authentication
router.use(authenticateJWT)

// Get user notifications
router.get("/", NotificationsController.getUserNotifications)

// Mark a notification as read
router.put("/:notificationId/read", NotificationsController.markAsRead)

// Mark all notifications as read
router.put("/read-all", NotificationsController.markAllAsRead)

export default router
