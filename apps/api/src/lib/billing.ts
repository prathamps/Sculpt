import { isStripeConfigured } from "./stripe"
import { isRazorpayConfigured } from "./razorpay"

export type BillingProvider = "razorpay" | "stripe"

// Resolve the active billing provider. Razorpay takes precedence when both are
// configured (it's the India-friendly default); Stripe is the fallback.
export const getBillingProvider = (): BillingProvider | null => {
	if (isRazorpayConfigured()) return "razorpay"
	if (isStripeConfigured()) return "stripe"
	return null
}

export const isBillingConfigured = (): boolean => getBillingProvider() !== null
