import { Router } from "express"
import * as subscriptionController from "../controllers/subscription.controller"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = Router()

// All routes here require an authenticated user. Webhooks (Stripe + Razorpay)
// are mounted separately in index.ts — they need the raw body and are public.
router.get("/status", authenticateJWT, subscriptionController.getStatus)
router.post("/checkout", authenticateJWT, subscriptionController.createCheckout)
router.post("/portal", authenticateJWT, subscriptionController.createPortal)
router.post("/cancel", authenticateJWT, subscriptionController.cancelSubscription)
router.post(
	"/razorpay/verify",
	authenticateJWT,
	subscriptionController.verifyRazorpay
)

export default router
