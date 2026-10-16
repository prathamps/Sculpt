"use client"

import {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
	useCallback,
	useMemo,
} from "react"
import { useRouter, usePathname } from "next/navigation"

interface AdminUser {
	id: string
	name: string
	email: string
	role: "ADMIN"
}

export type AdminSignInResult =
	| { status: "signed_in" }
	| { status: "second_factor_required" }
	| { status: "failed"; message: string }

interface AdminAuthContextType {
	adminUser: AdminUser | null
	isAdminAuthenticated: boolean
	adminLogin: (email: string, password: string) => Promise<AdminSignInResult>
	completeAdminSignIn: () => Promise<boolean>
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
			} catch {
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

	const completeAdminSignIn = useCallback(async (): Promise<boolean> => {
		const profileRes = await fetch(`${URI}/api/admin/profile`, {
			credentials: "include",
		})
		if (!profileRes.ok) return false
		setAdminUser(await profileRes.json())
		router.push("/admin")
		return true
	}, [router])

	const adminLogin = useCallback(
		async (email: string, password: string): Promise<AdminSignInResult> => {
			try {
				const res = await fetch(`${URI}/api/admin/login`, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ email, password }),
				})
				const body = (await res.json().catch(() => null)) as {
					mfaRequired?: boolean
					message?: string
				} | null

				if (!res.ok) {
					return {
						status: "failed",
						message: body?.message || "Invalid email or password",
					}
				}
				if (body?.mfaRequired) return { status: "second_factor_required" }
				return (await completeAdminSignIn())
					? { status: "signed_in" }
					: { status: "failed", message: "Could not open the admin console." }
			} catch {
				return { status: "failed", message: "The server could not be reached." }
			}
		},
		[completeAdminSignIn]
	)

	const adminLogout = useCallback(async () => {
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
	}, [router])

	const value = useMemo(
		() => ({
			adminUser,
			isAdminAuthenticated: !!adminUser,
			adminLogin,
			completeAdminSignIn,
			adminLogout,
			loading,
		}),
		[adminUser, loading, adminLogin, completeAdminSignIn, adminLogout]
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
