"use client"

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
	useMemo,
	ReactNode,
} from "react"
import { toast } from "sonner"
import { useAuth } from "./AuthContext"
import { loadRazorpayScript, openRazorpayCheckout } from "@/lib/razorpay"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export type Plan = "FREE" | "PRO"
export type BillingProvider = "razorpay" | "stripe" | null

export interface PlanLimits {
	maxProjects: number
	maxMembersPerProject: number
	maxVersionsPerItem: number
	canUploadVideo: boolean
	canExportReports: boolean
}

interface SubscriptionContextType {
	plan: Plan
	status: string
	currentPeriodEnd: string | null
	limits: PlanLimits | null
	provider: BillingProvider
	billingConfigured: boolean
	loading: boolean
	isPro: boolean
	refresh: () => Promise<void>
	startCheckout: () => Promise<void>
	openPortal: () => Promise<void>
	cancelSubscription: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(
	undefined
)

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
	const { isAuthenticated } = useAuth()
	const [plan, setPlan] = useState<Plan>("FREE")
	const [status, setStatus] = useState("active")
	const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null)
	const [limits, setLimits] = useState<PlanLimits | null>(null)
	const [provider, setProvider] = useState<BillingProvider>(null)
	const [billingConfigured, setBillingConfigured] = useState(false)
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		if (!isAuthenticated) {
			setLoading(false)
			return
		}
		try {
			const res = await fetch(`${API_URL}/api/subscriptions/status`, {
				credentials: "include",
			})
			if (res.ok) {
				const data = await res.json()
				setPlan(data.plan)
				setStatus(data.status)
				setCurrentPeriodEnd(data.currentPeriodEnd ?? null)
				setLimits(data.limits ?? null)
				setProvider(data.provider ?? null)
				setBillingConfigured(!!data.billingConfigured)
			}
		} catch (error) {
			console.error("Failed to fetch subscription status:", error)
		} finally {
			setLoading(false)
		}
	}, [isAuthenticated])

	useEffect(() => {
		refresh()
	}, [refresh])

	const startCheckout = useCallback(async () => {
		try {
			const res = await fetch(`${API_URL}/api/subscriptions/checkout`, {
				method: "POST",
				credentials: "include",
			})
			const data = await res.json().catch(() => ({}))

			if (res.status === 503) {
				toast.error(
					"Billing isn't configured on this server yet. Add your Razorpay (or Stripe) keys to enable PRO checkout."
				)
				return
			}
			if (!res.ok) {
				toast.error(data.message || "Could not start checkout.")
				return
			}

			// Razorpay: open the in-page Checkout modal, then verify server-side.
			if (data.type === "razorpay") {
				const loaded = await loadRazorpayScript()
				if (!loaded) {
					toast.error("Could not load Razorpay. Check your connection.")
					return
				}
				const response = await openRazorpayCheckout({
					keyId: data.keyId,
					subscriptionId: data.subscriptionId,
					name: data.name,
					description: data.description,
					email: data.email,
				})
				if (!response) return // user dismissed the modal

				// The payment is already in flight — handle verify failures on their
				// own so we never blame "checkout" for a post-payment hiccup.
				try {
					const verify = await fetch(
						`${API_URL}/api/subscriptions/razorpay/verify`,
						{
							method: "POST",
							credentials: "include",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(response),
						}
					)
					if (verify.ok) {
						await refresh()
						window.location.href = "/dashboard?checkout=success"
					} else {
						toast.error(
							"We couldn't confirm your payment automatically. If you were charged, your PRO access will activate shortly — try refreshing."
						)
					}
				} catch {
					toast.error(
						"Payment received, but confirmation didn't complete. If you were charged, PRO will sync shortly — please refresh in a moment."
					)
				}
				return
			}

			// Stripe: hosted redirect.
			if (data.type === "redirect" && data.url) {
				window.location.href = data.url
				return
			}

			toast.error("Could not start checkout.")
		} catch {
			toast.error("Could not start checkout. Please try again.")
		}
	}, [refresh])

	const openPortal = useCallback(async () => {
		try {
			const res = await fetch(`${API_URL}/api/subscriptions/portal`, {
				method: "POST",
				credentials: "include",
			})
			const data = await res.json().catch(() => ({}))
			if (res.ok && data.url) {
				window.location.href = data.url
				return
			}
			toast.error(data.message || "Could not open the billing portal.")
		} catch {
			toast.error("Could not open the billing portal. Please try again.")
		}
	}, [])

	const cancelSubscription = useCallback(async () => {
		try {
			const res = await fetch(`${API_URL}/api/subscriptions/cancel`, {
				method: "POST",
				credentials: "include",
			})
			const data = await res.json().catch(() => ({}))
			if (res.ok) {
				toast.success("Your subscription has been cancelled.")
				// Reflect the downgrade immediately so the UI can't show stale PRO
				// state if the follow-up status refresh fails.
				setPlan("FREE")
				setStatus("cancelled")
				await refresh()
				return
			}
			toast.error(data.message || "Could not cancel the subscription.")
		} catch {
			toast.error("Could not cancel the subscription. Please try again.")
		}
	}, [refresh])

	const value = useMemo(
		() => ({
			plan,
			status,
			currentPeriodEnd,
			limits,
			provider,
			billingConfigured,
			loading,
			isPro: plan === "PRO",
			refresh,
			startCheckout,
			openPortal,
			cancelSubscription,
		}),
		[
			plan,
			status,
			currentPeriodEnd,
			limits,
			provider,
			billingConfigured,
			loading,
			refresh,
			startCheckout,
			openPortal,
			cancelSubscription,
		]
	)

	return (
		<SubscriptionContext.Provider value={value}>
			{children}
		</SubscriptionContext.Provider>
	)
}

export const useSubscription = () => {
	const ctx = useContext(SubscriptionContext)
	if (ctx === undefined) {
		throw new Error("useSubscription must be used within a SubscriptionProvider")
	}
	return ctx
}
