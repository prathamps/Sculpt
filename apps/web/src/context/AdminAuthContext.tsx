"use client"

import {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
	useMemo,
} from "react"
import { useRouter, usePathname } from "next/navigation"

interface AdminUser {
	id: string
	name: string
	email: string
	role: "ADMIN"
}

interface AdminAuthContextType {
	adminUser: AdminUser | null
	isAdminAuthenticated: boolean
	adminLogin: (email: string, password: string) => Promise<boolean>
	adminLogout: () => void
	loading: boolean
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
	undefined
)

const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
	const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
	const [loading, setLoading] = useState(true)
	const router = useRouter()
	const pathname = usePathname()

	useEffect(() => {
		const fetchAdminUser = async () => {
			try {
				// We use a different endpoint for admin profile
				const res = await fetch(`${URI}/api/admin/profile`, {
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
				})
				if (res.ok) {
					const data = await res.json()
					setAdminUser(data)
				} else {
					setAdminUser(null)
				}
			} catch (error) {
				setAdminUser(null)
			} finally {
				setLoading(false)
			}
		}
		if (pathname.startsWith("/admin")) {
			fetchAdminUser()
		} else {
			setLoading(false)
		}
	}, [pathname])

	const adminLogin = async (
		email: string,
		password: string
	): Promise<boolean> => {
		try {
			const res = await fetch(`${URI}/api/admin/login`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email, password }),
			})

			if (res.ok) {
				// Fetch admin profile after successful login
				const profileRes = await fetch(`${URI}/api/admin/profile`, {
					credentials: "include",
				})

				if (profileRes.ok) {
					const data = await profileRes.json()
					setAdminUser(data)
					router.push("/admin")
					return true
				}
			}

			return false
		} catch (error) {
			console.error("Admin login error:", error)
			return false
		}
	}

	const adminLogout = async () => {
		try {
			await fetch(`${URI}/api/admin/logout`, {
				method: "POST",
				credentials: "include",
			})
			setAdminUser(null)
			router.push("/admin-login")
		} catch (error) {
			console.error("Admin logout error:", error)
		}
	}

	const value = useMemo(
		() => ({
			adminUser,
			isAdminAuthenticated: !!adminUser,
			adminLogin,
			adminLogout,
			loading,
		}),
		[adminUser, loading, adminLogin, adminLogout]
	)

	return (
		<AdminAuthContext.Provider value={value}>
			{children}
		</AdminAuthContext.Provider>
	)
}

export const useAdminAuth = () => {
	const context = useContext(AdminAuthContext)
	if (context === undefined) {
		throw new Error("useAdminAuth must be used within an AdminAuthProvider")
	}
	return context
}
