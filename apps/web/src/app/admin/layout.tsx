"use client"

import { useEffect } from "react"
import { useAdminAuth } from "@/context/AdminAuthContext"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function AdminLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const { adminUser, loading, isAdminAuthenticated } = useAdminAuth()
	const router = useRouter()

	useEffect(() => {
		if (!loading && !isAdminAuthenticated) {
			router.push("/admin-login")
		}
	}, [loading, isAdminAuthenticated, router])

	if (loading) {
		return (
			<div className="flex h-screen w-screen items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<span className="ml-2">Loading...</span>
			</div>
		)
	}

	if (!isAdminAuthenticated) {
		return null // Will be redirected by the useEffect
	}

	return children
}
