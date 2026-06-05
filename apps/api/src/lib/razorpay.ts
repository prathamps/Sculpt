import Razorpay from "razorpay"

// Razorpay is optional: when keys are absent the provider simply stays disabled.
const keyId = process.env.RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET

// Type inferred as `Razorpay | null`.
export const razorpay =
	keyId && keySecret
		? new Razorpay({ key_id: keyId, key_secret: keySecret })
		: null

export const isRazorpayConfigured = (): boolean => razorpay !== null

export const RAZORPAY_KEY_ID = keyId || ""
export const RAZORPAY_KEY_SECRET = keySecret || ""
export const RAZORPAY_PLAN_ID = process.env.RAZORPAY_PLAN_ID || ""
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || ""
// Number of billing cycles before the subscription completes (e.g. 12 months).
export const RAZORPAY_TOTAL_COUNT = Number(
	process.env.RAZORPAY_TOTAL_COUNT || 12
)
