"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { Download, Loader2, ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "sonner"
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
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

interface MfaStatus {
	enabled: boolean
	enabledAt: string | null
	recoveryCodesRemaining: number
	required: boolean
}

interface Enrollment {
	secret: string
	otpauthUri: string
}

type Panel = "idle" | "enrolling" | "regenerating" | "disabling"

const groupedSecret = (secret: string): string => secret.match(/.{1,4}/g)?.join(" ") ?? secret

const downloadRecoveryCodes = (codes: string[]) => {
	const blob = new Blob(
		[`Sculpt recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`],
		{ type: "text/plain" }
	)
	const link = document.createElement("a")
	link.href = URL.createObjectURL(blob)
	link.download = "sculpt-recovery-codes.txt"
	link.click()
	URL.revokeObjectURL(link.href)
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
	return (
		<div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4">
			<p className="text-sm font-medium">Save your recovery codes</p>
			<p className="text-xs text-muted-foreground">
				If you lose your phone, each of these codes signs you in once. They are shown only now.
			</p>
			<ul className="grid grid-cols-2 gap-1 font-mono text-sm" aria-label="Recovery codes">
				{codes.map((code) => (
					<li key={code}>{code}</li>
				))}
			</ul>
			<div className="flex flex-wrap gap-2">
				<Button type="button" variant="outline" size="sm" onClick={() => downloadRecoveryCodes(codes)}>
					<Download className="mr-2 h-4 w-4" aria-hidden="true" />
					Download
				</Button>
				<Button type="button" size="sm" onClick={onDone}>
					I have saved them
				</Button>
			</div>
		</div>
	)
}

function CodeField({
	id,
	label,
	value,
	onChange,
}: {
	id: string
	label: string
	value: string
	onChange: (value: string) => void
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				inputMode="numeric"
				autoComplete="one-time-code"
				pattern="\d{6}"
				maxLength={6}
				required
				className="max-w-[10rem]"
			/>
		</div>
	)
}

export function TwoFactorSettings() {
	const [status, setStatus] = useState<MfaStatus | null>(null)
	const [panel, setPanel] = useState<Panel>("idle")
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
	const [code, setCode] = useState("")
	const [password, setPassword] = useState("")
	const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
	const [isBusy, setIsBusy] = useState(false)

	const loadStatus = useCallback(async () => {
		try {
			setStatus(await api.get<MfaStatus>("/api/users/me/mfa"))
		} catch (error) {
			toast.error(describeError(error, "Could not load two-factor settings."))
		}
	}, [])

	useEffect(() => {
		void loadStatus()
	}, [loadStatus])

	useEffect(() => {
		if (!enrollment) {
			setQrDataUrl(null)
			return
		}
		let cancelled = false
		import("qrcode")
			.then((QRCode) => QRCode.toDataURL(enrollment.otpauthUri, { margin: 1, width: 192 }))
			.then((url) => {
				if (!cancelled) setQrDataUrl(url)
			})
			.catch(() => undefined)
		return () => {
			cancelled = true
		}
	}, [enrollment])

	const reset = () => {
		setPanel("idle")
		setEnrollment(null)
		setCode("")
		setPassword("")
	}

	const run = async (action: () => Promise<void>, failure: string) => {
		setIsBusy(true)
		try {
			await action()
		} catch (error) {
			toast.error(describeError(error, failure))
		} finally {
			setIsBusy(false)
		}
	}

	const startEnrollment = () =>
		run(async () => {
			setEnrollment(await api.post<Enrollment>("/api/users/me/mfa/setup"))
			setPanel("enrolling")
		}, "Could not start two-factor setup.")

	const confirmEnrollment = (event: React.FormEvent) => {
		event.preventDefault()
		return run(async () => {
			const result = await api.post<{ recoveryCodes: string[] }>(
				"/api/users/me/mfa/enable",
				{ code: code.trim() }
			)
			setRecoveryCodes(result.recoveryCodes)
			reset()
			toast.success("Two-factor authentication is on. Other devices were signed out.")
			await loadStatus()
		}, "That code did not match.")
	}

	const regenerate = (event: React.FormEvent) => {
		event.preventDefault()
		return run(async () => {
			const result = await api.post<{ recoveryCodes: string[] }>(
				"/api/users/me/mfa/recovery-codes",
				{ code: code.trim() }
			)
			setRecoveryCodes(result.recoveryCodes)
			reset()
			await loadStatus()
		}, "Could not create new recovery codes.")
	}

	const disable = (event: React.FormEvent) => {
		event.preventDefault()
		return run(async () => {
			await api.post("/api/users/me/mfa/disable", {
				code: code.trim(),
				...(password ? { password } : {}),
			})
			reset()
			toast.success("Two-factor authentication is off.")
			await loadStatus()
		}, "Could not turn off two-factor authentication.")
	}

	return (
		<Card id="two-factor">
			<CardHeader>
				<CardTitle className="text-base">Two-factor authentication</CardTitle>
				<CardDescription>
					Require a code from an authenticator app, in addition to your password, when you sign in.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!status ? (
					<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
				) : (
					<>
						<p className="flex items-center gap-2 text-sm" role="status">
							{status.enabled ? (
								<>
									<ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
									On since {new Date(status.enabledAt ?? "").toLocaleDateString()} ·{" "}
									{status.recoveryCodesRemaining} recovery codes left
								</>
							) : (
								<>
									<ShieldOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
									Off{status.required ? " — your organisation requires it" : ""}
								</>
							)}
						</p>

						{recoveryCodes && (
							<RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
						)}

						{panel === "idle" && !status.enabled && (
							<Button onClick={() => void startEnrollment()} disabled={isBusy}>
								Turn on two-factor authentication
							</Button>
						)}

						{panel === "idle" && status.enabled && (
							<div className="flex flex-wrap gap-2">
								<Button variant="outline" onClick={() => setPanel("regenerating")}>
									New recovery codes
								</Button>
								{!status.required && (
									<Button variant="outline" className="text-destructive" onClick={() => setPanel("disabling")}>
										Turn off
									</Button>
								)}
							</div>
						)}

						{panel === "enrolling" && enrollment && (
							<form onSubmit={confirmEnrollment} className="space-y-4">
								<ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
									<li>Open an authenticator app such as 1Password, Google Authenticator or Authy.</li>
									<li>Scan the QR code, or enter the key by hand.</li>
									<li>Type the 6-digit code it shows.</li>
								</ol>
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
									{qrDataUrl ? (
										<Image
											src={qrDataUrl}
											width={192}
											height={192}
											unoptimized
											alt="QR code to add Sculpt to your authenticator app"
											className="rounded-md border border-border"
										/>
									) : (
										<div className="flex h-48 w-48 items-center justify-center rounded-md border border-border">
											<Loader2 className="h-5 w-5 animate-spin" aria-label="Preparing QR code" />
										</div>
									)}
									<div className="space-y-1">
										<p className="text-xs text-muted-foreground">Setup key</p>
										<code className="block break-all font-mono text-sm">
											{groupedSecret(enrollment.secret)}
										</code>
									</div>
								</div>
								<CodeField id="enroll-code" label="Code from your app" value={code} onChange={setCode} />
								<div className="flex gap-2">
									<Button type="submit" disabled={isBusy || code.trim().length !== 6}>
										Turn on
									</Button>
									<Button type="button" variant="ghost" onClick={reset}>
										Cancel
									</Button>
								</div>
							</form>
						)}

						{panel === "regenerating" && (
							<form onSubmit={regenerate} className="space-y-4">
								<p className="text-sm text-muted-foreground">
									Your current recovery codes stop working once new ones are created.
								</p>
								<CodeField id="regenerate-code" label="Code from your app" value={code} onChange={setCode} />
								<div className="flex gap-2">
									<Button type="submit" disabled={isBusy || code.trim().length !== 6}>
										Create new codes
									</Button>
									<Button type="button" variant="ghost" onClick={reset}>
										Cancel
									</Button>
								</div>
							</form>
						)}

						{panel === "disabling" && (
							<form onSubmit={disable} className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="disable-password">Current password</Label>
									<Input
										id="disable-password"
										type="password"
										autoComplete="current-password"
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										className="max-w-xs"
									/>
									<p className="text-xs text-muted-foreground">
										Leave blank if you sign in with Google or GitHub.
									</p>
								</div>
								<CodeField id="disable-code" label="Code from your app" value={code} onChange={setCode} />
								<div className="flex gap-2">
									<Button type="submit" variant="destructive" disabled={isBusy || code.trim().length !== 6}>
										Turn off two-factor
									</Button>
									<Button type="button" variant="ghost" onClick={reset}>
										Cancel
									</Button>
								</div>
							</form>
						)}
					</>
				)}
			</CardContent>
		</Card>
	)
}
