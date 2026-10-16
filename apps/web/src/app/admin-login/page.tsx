"use client"

import { useState } from "react"
import Link from "next/link"
import { useAdminAuth } from "@/context/AdminAuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TwoFactorChallengeForm } from "@/components/TwoFactorChallengeForm"

export default function AdminLoginPage() {
	const { adminLogin, completeAdminSignIn } = useAdminAuth()
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState("")
	const [awaitingSecondFactor, setAwaitingSecondFactor] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		setError("")
		setIsSubmitting(true)
		const result = await adminLogin(email, password)
		setIsSubmitting(false)
		if (result.status === "second_factor_required") {
			setPassword("")
			setAwaitingSecondFactor(true)
		} else if (result.status === "failed") {
			setError(result.message)
		}
	}

	return (
		<main className="flex h-screen items-center justify-center bg-background px-4">
			<div className="w-full max-w-md space-y-6 rounded-lg bg-card p-8 shadow-md">
				<h1 className="text-center text-2xl font-bold">Admin Login</h1>
				{awaitingSecondFactor ? (
					<TwoFactorChallengeForm
						onVerified={() => void completeAdminSignIn()}
						onCancel={() => setAwaitingSecondFactor(false)}
					/>
				) : (
					<form onSubmit={handleSubmit} className="space-y-6">
						<div>
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
						</div>
						<div>
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								required
							/>
						</div>
						{error && (
							<p role="alert" className="text-sm text-destructive">
								{error}{" "}
								{error.includes("two-factor") && (
									<Link href="/account#two-factor" className="underline">
										Open account settings
									</Link>
								)}
							</p>
						)}
						<Button type="submit" className="w-full" disabled={isSubmitting}>
							Login
						</Button>
					</form>
				)}
			</div>
		</main>
	)
}
