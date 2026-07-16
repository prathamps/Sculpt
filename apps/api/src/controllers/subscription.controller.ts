import { Request, Response } from "express"
import { AuthenticatedUser } from "../types"
import * as stripeService from "../services/stripe.service"
import * as razorpayService from "../services/razorpay.service"
import {
	ensureSubscription,
	getUserPlan,
} from "../services/subscription.service"
import { PLAN_LIMITS } from "../lib/plans"
import { getBillingProvider } from "../lib/billing"

const notConfigured = (error: unknown): boolean =>
	error instanceof Error &&
	((error as any).code === "STRIPE_NOT_CONFIGURED" ||
		(error as any).code === "BILLING_NOT_CONFIGURED")

// GET /api/subscriptions/status — current plan, limits and billing metadata.
export const getStatus = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = req.user as AuthenticatedUser
		const sub = await ensureSubscription(user.id)
		const plan = await getUserPlan(user.id)
		const provider = getBillingProvider()
		res.status(200).json({
			plan,
			status: sub.status,
			currentPeriodEnd: sub.currentPeriodEnd ?? sub.stripeCurrentPeriodEnd,
			limits: PLAN_LIMITS[plan],
			provider, // "razorpay" | "stripe" | null
			billingConfigured: provider !== null,
		})
	} catch (error) {
		res.status(500).json({ message: "Error fetching subscription", error })
	}
}

// POST /api/subscriptions/checkout — provider-aware. Returns either a redirect
// URL (Stripe) or the Razorpay Checkout params for the in-page modal.
export const createCheckout = async (
	req: Request,
	res: Response
): Promise<void> => {
	const user = req.user as AuthenticatedUser
	const provider = getBillingProvider()
	try {
		if (provider === "razorpay") {
			const checkout = await razorpayService.createSubscriptionCheckout(
				user.id,
				user.email,
				user.name
			)
			res.status(200).json(checkout)
			return
		}
		if (provider === "stripe") {
			const url = await stripeService.createCheckoutSession(user.id, user.email)
			res.status(200).json({ type: "redirect", url })
			return
		}
		res.status(503).json({
			message: "Billing is not configured on this server.",
			code: "BILLING_NOT_CONFIGURED",
		})
	} catch (error) {
		if (notConfigured(error)) {
			res.status(503).json({
				message: (error as Error).message,
				code: "BILLING_NOT_CONFIGURED",
			})
			return
		}
		console.error("Error creating checkout:", error)
		res.status(500).json({ message: "Error creating checkout" })
	}
}

// POST /api/subscriptions/razorpay/verify — confirm the Checkout payment.
export const verifyRazorpay = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const user = req.user as AuthenticatedUser
		const {
			razorpay_payment_id,
			razorpay_subscription_id,
			razorpay_signature,
		} = req.body
		if (
			!razorpay_payment_id ||
			!razorpay_subscription_id ||
			!razorpay_signature
		) {
			res.status(400).json({ message: "Missing Razorpay payment fields" })
			return
		}
		const ok = await razorpayService.verifyCheckoutSignature({
			userId: user.id,
			razorpay_payment_id,
			razorpay_subscription_id,
			razorpay_signature,
		})
		if (ok) {
			res.status(200).json({ success: true, plan: "PRO" })
		} else {
			res
				.status(400)
				.json({ success: false, message: "Signature verification failed" })
		}
	} catch (error) {
		console.error("Razorpay verify error:", error)
		res.status(500).json({ message: "Error verifying payment" })
	}
}

// POST /api/subscriptions/cancel — Razorpay: cancel now. Stripe users use /portal.
export const cancelSubscription = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const user = req.user as AuthenticatedUser
		await razorpayService.cancelSubscription(user.id)
		res.status(200).json({ success: true })
	} catch (error) {
		console.error("Cancel subscription error:", error)
		res
			.status(400)
			.json({ message: error instanceof Error ? error.message : "Error" })
	}
}

// POST /api/subscriptions/portal — Stripe Billing Portal URL.
export const createPortal = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const user = req.user as AuthenticatedUser
		const url = await stripeService.createPortalSession(user.id)
		res.status(200).json({ url })
	} catch (error) {
		if (notConfigured(error)) {
			res
				.status(503)
				.json({ message: (error as Error).message, code: "BILLING_NOT_CONFIGURED" })
			return
		}
		console.error("Error creating portal session:", error)
		res
			.status(400)
			.json({ message: error instanceof Error ? error.message : "Error" })
	}
}

// POST /api/subscriptions/webhook — Stripe event ingestion (raw body).
export const handleWebhook = async (
	req: Request,
	res: Response
): Promise<void> => {
	const signature = req.headers["stripe-signature"] as string | undefined
	try {
		await stripeService.handleWebhookEvent(req.body as Buffer, signature)
		res.status(200).json({ received: true })
	} catch (error) {
		console.error("Stripe webhook error:", error)
		res
			.status(400)
			.send(
				`Webhook Error: ${error instanceof Error ? error.message : "unknown"}`
			)
	}
}

// POST /api/subscriptions/razorpay/webhook — Razorpay event ingestion (raw body).
export const handleRazorpayWebhook = async (
	req: Request,
	res: Response
): Promise<void> => {
	const signature = req.headers["x-razorpay-signature"] as string | undefined
	try {
		await razorpayService.handleWebhookEvent(req.body as Buffer, signature)
		res.status(200).json({ received: true })
	} catch (error) {
		console.error("Razorpay webhook error:", error)
		res
			.status(400)
			.send(
				`Webhook Error: ${error instanceof Error ? error.message : "unknown"}`
			)
	}
}
