"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { Loader2 } from "lucide-react"

export default function JoinPage() {
	const router = useRouter()
	const params = useParams()
	const { isAuthenticated, loading } = useAuth()
	const [message, setMessage] = useState("Processing your invitation...")
	const token = params.token as string
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	useEffect(() => {
		if (loading) {
			return
		}
		if (!isAuthenticated) {
			router.push(`/login?redirect=/join/${token}`)
			return
		}

		const joinProject = async () => {
			if (!token) {
				setMessage("Invalid link.")
				return
			}
			try {
				const res = await fetch(`${URI}/api/share/${token}`, {
					method: "POST",
					credentials: "include",
				})

				if (res.ok) {
					setMessage("Successfully joined project! Redirecting...")
					router.push("/dashboard")
				} else {
					const data = await res.json()
					setMessage(data.message || "Failed to join project.")
				}
			} catch {
				setMessage("An unexpected error occurred.")
			}
		}

		joinProject()
	}, [token, isAuthenticated, loading, router])

	return (
		<div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center text-foreground">
			<Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
			<p className="text-sm text-muted-foreground" role="status" aria-live="polite">
				{message}
			</p>
		</div>
	)
}
