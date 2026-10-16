"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { TwoFactorChallengeForm } from "@/components/TwoFactorChallengeForm"
import { useAuth } from "@/context/AuthContext"
import { authToasts } from "@/lib/auth-toasts"

export default function TwoFactorSignInPage() {
	const { login } = useAuth()
	const router = useRouter()

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
			<div className="w-full max-w-md rounded-lg border border-border/50 bg-card p-6 shadow-sm">
				<TwoFactorChallengeForm
					onVerified={() => {
						authToasts.showLoginSuccess()
						login()
					}}
					onCancel={() => router.push("/login")}
				/>
			</div>
			<Link href="/login" className="mt-6 text-sm text-primary hover:underline">
				Back to sign in
			</Link>
		</main>
	)
}
