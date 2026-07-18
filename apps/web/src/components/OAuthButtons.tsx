"use client"

import { useEffect, useState } from "react"
import { Github } from "lucide-react"
import { Button } from "@/components/ui/button"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
			/>
			<path
				fill="#34A853"
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
			/>
			<path
				fill="#FBBC05"
				d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
			/>
			<path
				fill="#EA4335"
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
			/>
		</svg>
	)
}

export function OAuthButtons() {
	const [enabledProviders, setEnabledProviders] = useState<{
		google: boolean
		github: boolean
	}>({ google: false, github: false })

	useEffect(() => {
		fetch(`${API_URL}/api/auth/providers`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => data && setEnabledProviders(data))
			.catch(() => {})
	}, [])

	const anyEnabled = enabledProviders.google || enabledProviders.github
	if (!anyEnabled) return null

	const go = (provider: "google" | "github") => {
		window.location.href = `${API_URL}/api/auth/${provider}`
	}

	return (
		<div className="space-y-3">
			<div className="relative">
				<div className="absolute inset-0 flex items-center">
					<span className="w-full border-t border-border/50" />
				</div>
				<div className="relative flex justify-center text-xs uppercase">
					<span className="bg-card px-2 text-muted-foreground">
						or continue with
					</span>
				</div>
			</div>
			<div className="grid gap-2">
				{enabledProviders.google && (
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => go("google")}
					>
						<GoogleIcon className="mr-2 h-4 w-4" />
						Google
					</Button>
				)}
				{enabledProviders.github && (
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => go("github")}
					>
						<Github className="mr-2 h-4 w-4" />
						GitHub
					</Button>
				)}
			</div>
		</div>
	)
}
