// Minimal typing for the Razorpay Checkout script injected at runtime.
export interface RazorpayPaymentResponse {
	razorpay_payment_id: string
	razorpay_subscription_id: string
	razorpay_signature: string
}

interface RazorpayInstance {
	open(): void
}

type RazorpayConstructor = new (options: {
	key: string
	subscription_id: string
	name: string
	description: string
	prefill: { email: string }
	theme: { color: string }
	handler: (response: RazorpayPaymentResponse) => void
	modal: { ondismiss: () => void }
}) => RazorpayInstance

declare global {
	interface Window {
		Razorpay?: RazorpayConstructor
	}
}

// Lazily inject the Razorpay Checkout script (once) and resolve when ready.
let loadingPromise: Promise<boolean> | null = null

export function loadRazorpayScript(): Promise<boolean> {
	if (typeof window === "undefined") return Promise.resolve(false)
	if (window.Razorpay) return Promise.resolve(true)
	if (loadingPromise) return loadingPromise

	loadingPromise = new Promise<boolean>((resolve) => {
		const script = document.createElement("script")
		script.src = "https://checkout.razorpay.com/v1/checkout.js"
		script.async = true

		let settled = false
		const finish = (ok: boolean) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			if (!ok) loadingPromise = null // allow a later retry
			resolve(ok)
		}
		// Don't hang the UI forever if the CDN stalls.
		const timer = setTimeout(() => finish(false), 10000)

		script.onload = () => finish(true)
		script.onerror = () => finish(false)
		document.body.appendChild(script)
	})
	return loadingPromise
}

export interface RazorpayCheckoutParams {
	keyId: string
	subscriptionId: string
	name: string
	description: string
	email: string
}

// Opens the Razorpay Checkout modal for a subscription. Resolves with the
// payment response on success, or null if the user dismisses the modal.
export function openRazorpayCheckout(
	params: RazorpayCheckoutParams
): Promise<RazorpayPaymentResponse | null> {
	return new Promise((resolve) => {
		const RazorpayCtor = window.Razorpay
		if (!RazorpayCtor) {
			resolve(null)
			return
		}
		const rzp = new RazorpayCtor({
			key: params.keyId,
			subscription_id: params.subscriptionId,
			name: params.name,
			description: params.description,
			prefill: { email: params.email },
			theme: { color: "#4783E8" },
			handler: (response: RazorpayPaymentResponse) => resolve(response),
			modal: { ondismiss: () => resolve(null) },
		})
		rzp.open()
	})
}
