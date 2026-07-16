import Stripe from "stripe"

// Stripe is optional: if no secret key is configured the app still boots and
// billing endpoints respond with a clear "not configured" error instead of
// crashing. This keeps local/dev and the FREE tier fully functional.
const secretKey = process.env.STRIPE_SECRET_KEY

// Type is inferred as `Stripe | null` — avoids namespace-as-type issues across
// stripe-node packaging variants.
export const stripe = secretKey ? new Stripe(secretKey) : null

export const isStripeConfigured = (): boolean => stripe !== null

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || ""
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ""
