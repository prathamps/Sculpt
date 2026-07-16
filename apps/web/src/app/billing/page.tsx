"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { useSubscription } from "@/context/SubscriptionContext"
import { Check, Loader2, Sparkles, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const FREE_FEATURES = [
	"Up to 3 projects",
	"Up to 3 members per project",
	"2 versions per file",
	"Image annotation & comments",
	"Export annotated PNG",
]

const PRO_FEATURES = [
	"Unlimited projects",
	"Unlimited members",
	"Unlimited versions per file",
	"Frame-by-frame video annotation",
	"Report export (PDF / CSV / JSON)",
	"Priority email notifications",
]

export default function BillingPage() {
	const { isAuthenticated, loading } = useAuth()
	const {
		plan,
		status,
		currentPeriodEnd,
		provider,
		billingConfigured,
		loading: subLoading,
		isPro,
		startCheckout,
		openPortal,
		cancelSubscription,
	} = useSubscription()
	const router = useRouter()

	useEffect(() => {
		if (!loading && !isAuthenticated) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router])

	if (loading || subLoading) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			</div>
		)
	}

	return (
		<div className="flex min-h-screen w-full flex-col bg-background">
			<Header />
			<main className="flex-1 overflow-y-auto p-4 md:p-8">
				<div className="mx-auto max-w-4xl">
					<div className="mb-8 text-center">
						<h1 className="text-2xl font-semibold md:text-3xl">
							Plans & Billing
						</h1>
						<p className="mt-2 text-muted-foreground">
							You&apos;re on the{" "}
							<span
								className={cn(
									"font-medium",
									isPro ? "text-primary" : "text-foreground"
								)}
							>
								{plan}
							</span>{" "}
							plan
							{isPro && status !== "active" && (
								<span className="text-destructive"> ({status})</span>
							)}
							{isPro && currentPeriodEnd && (
								<>
									{" "}
									· renews{" "}
									{new Date(currentPeriodEnd).toLocaleDateString()}
								</>
							)}
							.
						</p>
					</div>

					{!billingConfigured && (
						<div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
							<AlertCircle className="h-4 w-4 flex-shrink-0" />
							Billing isn&apos;t configured on this server yet. Add your Razorpay keys
							(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_ID) — or Stripe
							keys — to enable PRO checkout.
						</div>
					)}

					<div className="grid gap-6 md:grid-cols-2">
						{/* FREE */}
						<div
							className={cn(
								"flex flex-col rounded-xl border bg-card p-6",
								!isPro ? "border-primary/40" : "border-border/50"
							)}
						>
							<div className="mb-4">
								<h2 className="text-lg font-semibold">Free</h2>
								<p className="mt-1 text-3xl font-bold">
									$0
									<span className="text-base font-normal text-muted-foreground">
										/mo
									</span>
								</p>
							</div>
							<ul className="mb-6 flex-1 space-y-2.5">
								{FREE_FEATURES.map((f) => (
									<li key={f} className="flex items-start gap-2 text-sm">
										<Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
										{f}
									</li>
								))}
							</ul>
							<Button variant="outline" disabled className="w-full">
								{isPro ? "Included" : "Current plan"}
							</Button>
						</div>

						{/* PRO */}
						<div className="relative flex flex-col rounded-xl border border-primary bg-card p-6 shadow-sm">
							<div className="absolute -top-3 left-6 flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
								<Sparkles className="h-3 w-3" />
								Recommended
							</div>
							<div className="mb-4">
								<h2 className="text-lg font-semibold">Pro</h2>
								<p className="mt-1 text-3xl font-bold">
									$12
									<span className="text-base font-normal text-muted-foreground">
										/mo
									</span>
								</p>
							</div>
							<ul className="mb-6 flex-1 space-y-2.5">
								{PRO_FEATURES.map((f) => (
									<li key={f} className="flex items-start gap-2 text-sm">
										<Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
										{f}
									</li>
								))}
							</ul>
							{isPro ? (
								provider === "razorpay" ? (
									<Button
										variant="outline"
										className="w-full"
										onClick={() => {
											if (
												confirm(
													"Cancel your PRO subscription? You'll move to the FREE plan."
												)
											) {
												cancelSubscription()
											}
										}}
									>
										Cancel subscription
									</Button>
								) : (
									<Button
										variant="outline"
										className="w-full"
										onClick={openPortal}
									>
										Manage billing
									</Button>
								)
							) : (
								<Button
									className="w-full"
									onClick={startCheckout}
									disabled={!billingConfigured}
								>
									<Sparkles className="mr-2 h-4 w-4" />
									Upgrade to PRO
								</Button>
							)}
						</div>
					</div>
				</div>
			</main>
		</div>
	)
}
