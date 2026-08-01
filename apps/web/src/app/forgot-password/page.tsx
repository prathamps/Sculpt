"use client"

import Link from "next/link"
import { useState } from "react"
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
import { Loader2, MailCheck } from "lucide-react"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isSent, setIsSent] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		setIsSubmitting(true)
		setError(null)

		try {
			await api.post("/api/auth/password-reset/request", { email })
			setIsSent(true)
		} catch (caught) {
			setError(describeError(caught, "Could not send the reset email."))
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Reset your password</CardTitle>
					<CardDescription>
						Enter the email address you sign in with and we&apos;ll send you a
						reset link.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isSent ? (
						<div className="flex flex-col items-center gap-3 py-4 text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
								<MailCheck className="h-6 w-6" aria-hidden="true" />
							</div>
							<p className="text-sm text-muted-foreground">
								If an account exists for <strong>{email}</strong>, a reset link
								is on its way. The link expires in one hour.
							</p>
							<Button asChild variant="outline" className="mt-2">
								<Link href="/login">Back to sign in</Link>
							</Button>
						</div>
					) : (
						<form onSubmit={handleSubmit} className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									autoComplete="email"
									required
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="you@example.com"
								/>
							</div>

							{error && (
								<p className="text-sm text-destructive" role="alert">
									{error}
								</p>
							)}

							<Button type="submit" disabled={isSubmitting || !email}>
								{isSubmitting && (
									<Loader2
										className="mr-2 h-4 w-4 animate-spin"
										aria-hidden="true"
									/>
								)}
								Send reset link
							</Button>

							<p className="text-center text-xs text-muted-foreground">
								Remembered it?{" "}
								<Link href="/login" className="text-primary hover:underline">
									Sign in
								</Link>
							</p>
						</form>
					)}
				</CardContent>
			</Card>
		</main>
	)
}
