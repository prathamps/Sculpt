"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { authToasts } from "@/lib/auth-toasts"

const SESSION_HYDRATION_FALLBACK_MS = 2500

export default function OAuthCallbackPage() {
	const { login: refreshProfileAndRedirectToDashboard } = useAuth()
	const router = useRouter()

	useEffect(() => {
		authToasts.showLoginSuccess()
		refreshProfileAndRedirectToDashboard()
		const fallbackIfSessionHydrationStalls = setTimeout(() => {
			router.replace("/dashboard")
		}, SESSION_HYDRATION_FALLBACK_MS)
		return () => clearTimeout(fallbackIfSessionHydrationStalls)
	}, [refreshProfileAndRedirectToDashboard, router])

	return (
		<div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background">
			<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			<p className="text-sm text-muted-foreground">Signing you in…</p>
		</div>
	)
}
