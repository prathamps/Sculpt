import {
	stripe,
	STRIPE_PRICE_ID,
	STRIPE_WEBHOOK_SECRET,
} from "../lib/stripe"
import { Plan } from "@prisma/client"
import {
	ensureSubscription,
	updateSubscription,
	findUserIdByStripeCustomerId,
} from "./subscription.service"

const FRONTEND_URL =
	process.env.FRONTEND_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"http://localhost:3000"

class StripeNotConfiguredError extends Error {
	public readonly code = "STRIPE_NOT_CONFIGURED"
	constructor() {
		super(
			"Billing is not configured on this server. Set STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET."
		)
		this.name = "StripeNotConfiguredError"
	}
}

const requireStripe = () => {
	if (!stripe) throw new StripeNotConfiguredError()
	return stripe
}

// Reuse (or lazily create) the Stripe customer tied to this user.
const getOrCreateCustomer = async (
	userId: string,
	email: string
): Promise<string> => {
	const client = requireStripe()
	const sub = await ensureSubscription(userId)
	if (sub.stripeCustomerId) return sub.stripeCustomerId

	const customer = await client.customers.create({
		email,
		metadata: { userId },
	})
	await updateSubscription(userId, { stripeCustomerId: customer.id })
	return customer.id
}

// Create a Checkout Session for the PRO plan and return its hosted URL.
export const createCheckoutSession = async (
	userId: string,
	email: string
): Promise<string> => {
	const client = requireStripe()
	if (!STRIPE_PRICE_ID) throw new StripeNotConfiguredError()

	const customerId = await getOrCreateCustomer(userId, email)

	const session = await client.checkout.sessions.create({
		mode: "subscription",
		customer: customerId,
		line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
		allow_promotion_codes: true,
		success_url: `${FRONTEND_URL}/dashboard?checkout=success`,
		cancel_url: `${FRONTEND_URL}/billing?checkout=cancelled`,
		metadata: { userId },
		subscription_data: { metadata: { userId } },
	})

	if (!session.url) throw new Error("Stripe did not return a checkout URL")
	return session.url
}

// Create a Billing Portal session so the customer can manage/cancel.
export const createPortalSession = async (
	userId: string
): Promise<string> => {
	const client = requireStripe()
	const sub = await ensureSubscription(userId)
	if (!sub.stripeCustomerId) {
		throw new Error("No Stripe customer on file. Subscribe to PRO first.")
	}
	const session = await client.billingPortal.sessions.create({
		customer: sub.stripeCustomerId,
		return_url: `${FRONTEND_URL}/billing`,
	})
	return session.url
}

// Map a Stripe Subscription object into our DB row. Typed loosely because the
// webhook payload shape varies across Stripe API versions.
const syncSubscriptionFromStripe = async (subscription: any): Promise<void> => {
	const userId =
		subscription?.metadata?.userId ||
		(await findUserIdByStripeCustomerId(subscription?.customer as string))
	if (!userId) {
		console.warn(
			`[stripe] Could not resolve userId for subscription ${subscription?.id}`
		)
		return
	}

	const item = subscription?.items?.data?.[0]
	const priceId = item?.price?.id ?? null
	const status: string = subscription?.status // active | canceled | past_due | ...
	const plan: Plan =
		status === "active" || status === "trialing" ? Plan.PRO : Plan.FREE

	// `current_period_end` lives at the top level in older API versions and on
	// the line item in newer ones — read defensively to stay version-agnostic.
	const periodEndUnix: number | undefined =
		subscription?.current_period_end ?? item?.current_period_end
	const stripeCurrentPeriodEnd = periodEndUnix
		? new Date(periodEndUnix * 1000)
		: null

	await updateSubscription(userId, {
		plan,
		status,
		provider: "stripe",
		stripeCustomerId: subscription?.customer as string,
		stripeSubscriptionId: subscription?.id,
		stripePriceId: priceId,
		currentPeriodEnd: stripeCurrentPeriodEnd,
		stripeCurrentPeriodEnd,
	})
	console.log(
		`[stripe] Synced subscription for user ${userId}: plan=${plan} status=${status}`
	)
}

// Verify + dispatch an incoming webhook (raw body required).
export const handleWebhookEvent = async (
	rawBody: Buffer,
	signature: string | undefined
): Promise<void> => {
	const client = requireStripe()
	if (!STRIPE_WEBHOOK_SECRET) throw new StripeNotConfiguredError()
	if (!signature) throw new Error("Missing stripe-signature header")

	const event = client.webhooks.constructEvent(
		rawBody,
		signature,
		STRIPE_WEBHOOK_SECRET
	)

	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object as any
			if (session.subscription) {
				const subscription = await client.subscriptions.retrieve(
					session.subscription as string
				)
				await syncSubscriptionFromStripe(subscription)
			}
			break
		}
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted": {
			await syncSubscriptionFromStripe(event.data.object as any)
			break
		}
		case "invoice.payment_failed": {
			const invoice = event.data.object as any
			const userId = await findUserIdByStripeCustomerId(
				invoice.customer as string
			)
			if (userId) {
				await updateSubscription(userId, { status: "past_due" })
			}
			break
		}
		default:
			// Unhandled event types are acknowledged but ignored.
			break
	}
}
