"use client"

import {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
	useMemo,
} from "react"
import { useRouter } from "next/navigation"

interface User {
	id: string
	name: string
	email: string
	role: "USER" | "ADMIN"
}

interface AuthContextType {
	user: User | null
	isAuthenticated: boolean
	login: () => void
	logout: () => void
	loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const [user, setUser] = useState<User | null>(null)
	const [loading, setLoading] = useState(true)
	const router = useRouter()

	useEffect(() => {
		const fetchUser = async () => {
			try {
				const res = await fetch(`${URI}/api/users/profile`, {
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
				})
				if (res.ok) {
					const data = await res.json()
					setUser(data)
				} else {
					setUser(null)
				}
			} catch (error) {
				setUser(null)
			} finally {
				setLoading(false)
			}
		}
		fetchUser()
	}, [])

	const login = () => {
		// The token is now handled by httpOnly cookie,
		// but we can re-fetch user profile here
		const fetchUser = async () => {
			try {
				const res = await fetch(`${URI}/api/users/profile`, {
					credentials: "include",
				})
				if (res.ok) {
					const data = await res.json()
					setUser(data)
					router.push("/dashboard")
				} else {
					setUser(null)
				}
			} catch (error) {
				setUser(null)
			}
		}
		fetchUser()
	}

	const logout = () => {
		// We need to make a request to the backend to clear the cookie
		const doLogout = async () => {
			await fetch(`${URI}/api/auth/logout`, {
				method: "POST",
				credentials: "include",
			})
			setUser(null)
			router.push("/login")
		}
		doLogout()
	}

	const value = useMemo(
		() => ({
			user,
			isAuthenticated: !!user,
			login,
			logout,
			loading,
		}),
		[user, loading]
	)

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
	const context = useContext(AuthContext)
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider")
	}
	return context
}
