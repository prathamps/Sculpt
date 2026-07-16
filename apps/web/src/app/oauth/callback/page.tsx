"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { authToasts } from "@/lib/auth-toasts"

// Landing page after a successful OAuth redirect. The API has already set the
// auth cookie (failures are redirected straight to /login by the API), so we
// refresh the user profile via login() — which redirects to the dashboard — and
// keep a safety fallback in case session hydration stalls.
export default function OAuthCallbackPage() {
	const { login } = useAuth()
	const router = useRouter()

	useEffect(() => {
		authToasts.showLoginSuccess()
		login() // fetches the profile and redirects to /dashboard on success
		const fallback = setTimeout(() => {
			// If login() couldn't establish a session, the dashboard guard sends
			// the user back to /login; otherwise this is a no-op.
			router.replace("/dashboard")
		}, 2500)
		return () => clearTimeout(fallback)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background">
			<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			<p className="text-sm text-muted-foreground">Signing you in…</p>
		</div>
	)
}
