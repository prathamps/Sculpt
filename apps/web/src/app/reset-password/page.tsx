"use client"

import Link from "next/link"
import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

const MINIMUM_PASSWORD_LENGTH = 8

function ResetPasswordForm() {
	const router = useRouter()
	const token = useSearchParams().get("token") ?? ""
	const [password, setPassword] = useState("")
	const [confirmation, setConfirmation] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const mismatch = confirmation.length > 0 && password !== confirmation
	const tooShort =
		password.length > 0 && password.length < MINIMUM_PASSWORD_LENGTH

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		if (mismatch || tooShort) return

		setIsSubmitting(true)
		setError(null)

		try {
			await api.post("/api/auth/password-reset/complete", { token, password })
			toast.success("Password updated. Sign in with your new password.")
			router.push("/login")
		} catch (caught) {
			setError(describeError(caught, "Could not reset your password."))
		} finally {
			setIsSubmitting(false)
		}
	}

	if (!token) {
		return (
			<CardContent>
				<p className="text-sm text-muted-foreground">
					This reset link is incomplete. Request a new one from the{" "}
					<Link href="/forgot-password" className="text-primary hover:underline">
						forgot password
					</Link>{" "}
					page.
				</p>
			</CardContent>
		)
	}

	return (
		<CardContent>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label htmlFor="password">New password</Label>
					<Input
						id="password"
						type="password"
						autoComplete="new-password"
						required
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
					{tooShort && (
						<p className="text-xs text-destructive">
							Use at least {MINIMUM_PASSWORD_LENGTH} characters.
						</p>
					)}
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="confirmation">Confirm new password</Label>
					<Input
						id="confirmation"
						type="password"
						autoComplete="new-password"
						required
						value={confirmation}
						onChange={(event) => setConfirmation(event.target.value)}
					/>
					{mismatch && (
						<p className="text-xs text-destructive">
							These passwords do not match.
						</p>
					)}
				</div>

				{error && (
					<p className="text-sm text-destructive" role="alert">
						{error}
					</p>
				)}

				<Button
					type="submit"
					disabled={isSubmitting || mismatch || tooShort || !password}
				>
					{isSubmitting && (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
					)}
					Set new password
				</Button>
			</form>
		</CardContent>
	)
}

export default function ResetPasswordPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Choose a new password</CardTitle>
					<CardDescription>
						Setting a new password signs you out everywhere else.
					</CardDescription>
				</CardHeader>
				<Suspense
					fallback={
						<CardContent>
							<Loader2
								className="h-5 w-5 animate-spin text-muted-foreground"
								aria-hidden="true"
							/>
						</CardContent>
					}
				>
					<ResetPasswordForm />
				</Suspense>
			</Card>
		</main>
	)
}
