import crypto from "crypto"
import {
	razorpay,
	RAZORPAY_KEY_ID,
	RAZORPAY_KEY_SECRET,
	RAZORPAY_PLAN_ID,
	RAZORPAY_WEBHOOK_SECRET,
	RAZORPAY_TOTAL_COUNT,
} from "../lib/razorpay"
import { Plan } from "@prisma/client"
import {
	ensureSubscription,
	updateSubscription,
	getUserSubscription,
	findUserIdByRazorpaySubscriptionId,
} from "./subscription.service"

class RazorpayNotConfiguredError extends Error {
	public readonly code = "BILLING_NOT_CONFIGURED"
	constructor(message?: string) {
		super(
			message ||
				"Razorpay is not configured on this server. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_PLAN_ID."
		)
		this.name = "RazorpayNotConfiguredError"
	}
}

const requireRazorpay = () => {
	if (!razorpay) throw new RazorpayNotConfiguredError()
	return razorpay
}

export interface RazorpayCheckout {
	type: "razorpay"
	keyId: string
	subscriptionId: string
	name: string
	description: string
	email: string
}

// Create a Razorpay subscription and return what the frontend Checkout needs.
export const createSubscriptionCheckout = async (
	userId: string,
	email: string,
	name?: string | null
): Promise<RazorpayCheckout> => {
	const client = requireRazorpay()
	if (!RAZORPAY_PLAN_ID) {
		throw new RazorpayNotConfiguredError(
			"Missing RAZORPAY_PLAN_ID. Create a Plan in the Razorpay dashboard (test mode) and set it."
		)
	}

	await ensureSubscription(userId)

	// Note: if the user dismisses the Checkout modal, this Razorpay subscription
	// stays in 'created' status and never activates (the user remains FREE).
	// Razorpay expires unpaid subscriptions automatically, so no cleanup is
	// needed; a fresh one is created on the next attempt.
	const subscription: any = await client.subscriptions.create({
		plan_id: RAZORPAY_PLAN_ID,
		total_count: RAZORPAY_TOTAL_COUNT,
		quantity: 1,
		customer_notify: 1,
		notes: { userId },
	} as any)

	// Record the pending subscription so webhooks can be matched back to the user.
	await updateSubscription(userId, {
		provider: "razorpay",
		razorpaySubscriptionId: subscription.id,
		status: subscription.status || "created",
	})

	return {
		type: "razorpay",
		keyId: RAZORPAY_KEY_ID,
		subscriptionId: subscription.id,
		name: "Sculpt PRO",
		description: "PRO plan subscription",
		email,
	}
}

// Verify the signature Razorpay Checkout returns after a successful payment.
// For subscriptions the signed payload is `payment_id|subscription_id`.
export const verifyCheckoutSignature = async (data: {
	userId: string
	razorpay_payment_id: string
	razorpay_subscription_id: string
	razorpay_signature: string
}): Promise<boolean> => {
	// Bind the verification to the subscription we created for THIS user, so a
	// valid payment triple from another account can't be replayed here.
	const sub = await getUserSubscription(data.userId)
	if (!sub || sub.razorpaySubscriptionId !== data.razorpay_subscription_id) {
		return false
	}

	const expected = crypto
		.createHmac("sha256", RAZORPAY_KEY_SECRET)
		.update(`${data.razorpay_payment_id}|${data.razorpay_subscription_id}`)
		.digest("hex")

	const valid = expected === data.razorpay_signature
	if (!valid) return false

	// Optimistically activate PRO; the webhook remains the source of truth.
	await updateSubscription(data.userId, {
		provider: "razorpay",
		plan: Plan.PRO,
		status: "active",
		razorpaySubscriptionId: data.razorpay_subscription_id,
	})
	return true
}

// Cancel the user's Razorpay subscription immediately and drop them to FREE.
export const cancelSubscription = async (userId: string): Promise<void> => {
	const client = requireRazorpay()
	const sub = await getUserSubscription(userId)
	if (!sub?.razorpaySubscriptionId) {
		throw new Error("No active Razorpay subscription to cancel.")
	}
	// cancel_at_cycle_end = false → cancel now
	await (client.subscriptions as any).cancel(sub.razorpaySubscriptionId, false)
	await updateSubscription(userId, {
		plan: Plan.FREE,
		status: "cancelled",
	})
}

// Map a Razorpay subscription entity into our DB row.
const syncSubscription = async (entity: any): Promise<void> => {
	const userId =
		entity?.notes?.userId ||
		(await findUserIdByRazorpaySubscriptionId(entity?.id))
	if (!userId) {
		console.warn(
			`[razorpay] Could not resolve userId for subscription ${entity?.id}`
		)
		return
	}

	const status: string = entity?.status // active, charged, cancelled, completed, halted, pending, ...
	const activeStatuses = ["active", "authenticated", "charged"]
	const plan: Plan = activeStatuses.includes(status) ? Plan.PRO : Plan.FREE

	const periodEndUnix: number | undefined =
		entity?.current_end ?? entity?.charge_at
	const currentPeriodEnd = periodEndUnix
		? new Date(periodEndUnix * 1000)
		: null

	await updateSubscription(userId, {
		provider: "razorpay",
		plan,
		status,
		razorpaySubscriptionId: entity?.id,
		currentPeriodEnd,
	})
	console.log(
		`[razorpay] Synced subscription for user ${userId}: plan=${plan} status=${status}`
	)
}

// Verify + dispatch an incoming Razorpay webhook (raw body required).
export const handleWebhookEvent = async (
	rawBody: Buffer,
	signature: string | undefined
): Promise<void> => {
	if (!RAZORPAY_WEBHOOK_SECRET) throw new RazorpayNotConfiguredError()
	if (!signature) throw new Error("Missing x-razorpay-signature header")

	const expected = crypto
		.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
		.update(rawBody)
		.digest("hex")
	if (expected !== signature) {
		throw new Error("Invalid webhook signature")
	}

	const event = JSON.parse(rawBody.toString("utf8"))
	const type: string = event?.event || ""

	if (type.startsWith("subscription.")) {
		const entity = event?.payload?.subscription?.entity
		if (entity) await syncSubscription(entity)
	}
}
