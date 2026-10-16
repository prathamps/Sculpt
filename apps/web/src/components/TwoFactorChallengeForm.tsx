"use client"

import { useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

export type SignedInKind = "user" | "admin"

interface TwoFactorChallengeFormProps {
	onVerified: (kind: SignedInKind) => void
	onCancel?: () => void
}

export function TwoFactorChallengeForm({ onVerified, onCancel }: TwoFactorChallengeFormProps) {
	const [usingRecoveryCode, setUsingRecoveryCode] = useState(false)
	const [value, setValue] = useState("")
	const [error, setError] = useState("")
	const [isVerifying, setIsVerifying] = useState(false)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setError("")
		setIsVerifying(true)
		try {
			const result = await api.post<{ kind: SignedInKind }>(
				"/api/auth/mfa/verify",
				usingRecoveryCode ? { recoveryCode: value.trim() } : { code: value.trim() }
			)
			onVerified(result.kind)
		} catch (caught) {
			setError(describeError(caught, "That code is not valid."))
			setValue("")
		} finally {
			setIsVerifying(false)
		}
	}

	const switchMethod = () => {
		setUsingRecoveryCode((current) => !current)
		setValue("")
		setError("")
	}

	const fieldId = usingRecoveryCode ? "recovery-code" : "authenticator-code"

	return (
		<form onSubmit={submit} className="space-y-4" aria-describedby="two-factor-help">
			<div className="flex items-center gap-2">
				<ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
				<h2 className="text-base font-semibold">Two-factor authentication</h2>
			</div>
			<p id="two-factor-help" className="text-sm text-muted-foreground">
				{usingRecoveryCode
					? "Enter one of the recovery codes you saved when you turned on two-factor authentication. Each code works once."
					: "Enter the 6-digit code from your authenticator app."}
			</p>
			<div className="space-y-2">
				<Label htmlFor={fieldId}>
					{usingRecoveryCode ? "Recovery code" : "Authentication code"}
				</Label>
				<Input
					id={fieldId}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					inputMode={usingRecoveryCode ? "text" : "numeric"}
					autoComplete="one-time-code"
					pattern={usingRecoveryCode ? undefined : "\\d{6}"}
					maxLength={usingRecoveryCode ? 32 : 6}
					required
					autoFocus
					aria-invalid={!!error}
					aria-describedby={error ? "two-factor-error" : undefined}
				/>
				{error && (
					<p id="two-factor-error" role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
			</div>
			<Button type="submit" className="w-full" disabled={isVerifying || !value.trim()}>
				{isVerifying ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
						Verifying…
					</>
				) : (
					"Verify"
				)}
			</Button>
			<div className="flex items-center justify-between text-sm">
				<button
					type="button"
					onClick={switchMethod}
					className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
				>
					{usingRecoveryCode ? "Use authenticator app instead" : "Use a recovery code"}
				</button>
				{onCancel && (
					<button
						type="button"
						onClick={onCancel}
						className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
					>
						Start over
					</button>
				)}
			</div>
		</form>
	)
}
