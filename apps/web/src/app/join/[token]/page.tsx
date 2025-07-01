"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"

export default function JoinPage() {
	const router = useRouter()
	const params = useParams()
	const { isAuthenticated, loading } = useAuth()
	const [message, setMessage] = useState("Processing your invitation...")
	const token = params.token as string

	useEffect(() => {
		if (loading) {
			return // Wait until auth state is loaded
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
				const res = await fetch(`http://localhost:3001/api/share/${token}`, {
					method: "POST",
					credentials: "include",
				})

				if (res.ok) {
					setMessage("Successfully joined project! Redirecting...")
					// Redirect to the dashboard, which will then show the new project
					router.push("/dashboard")
				} else {
					const data = await res.json()
					setMessage(data.message || "Failed to join project.")
				}
			} catch (error) {
				setMessage("An unexpected error occurred.")
			}
		}

		joinProject()
	}, [token, isAuthenticated, loading, router])

	return (
		<div className="flex h-screen w-full items-center justify-center bg-black text-white">
			<p>{message}</p>
		</div>
	)
}
