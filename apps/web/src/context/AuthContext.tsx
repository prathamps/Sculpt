"use client"

import {
	createContext,
	useCallback,
	useContext,
	useState,
	useEffect,
	ReactNode,
	useMemo,
} from "react"
import { useRouter } from "next/navigation"
import { SESSION_EXPIRED_EVENT, api } from "@/lib/api"
import { ignoreFailure } from "@/lib/errors"
import { toast } from "sonner"

interface User {
	id: string
	name: string
	email: string
	role: "USER" | "ADMIN"
	avatarUrl?: string | null
	emailNotifications?: boolean
	emailOnMention?: boolean
	emailOnComment?: boolean
	emailOnReply?: boolean
	emailOnReview?: boolean
}

interface AuthContextType {
	user: User | null
	isAuthenticated: boolean
	login: (destination?: string) => void
	logout: () => void
	refresh: () => Promise<void>
	loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const safeDestination = (destination?: string | null): string =>
	destination && destination.startsWith("/") && !destination.startsWith("//")
		? destination
		: "/dashboard"

export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const [user, setUser] = useState<User | null>(null)
	const [loading, setLoading] = useState(true)
	const router = useRouter()

	const loadUser = useCallback(async (): Promise<User | null> => {
		try {
			const profile = await api.get<User>("/api/users/profile")
			setUser(profile)
			return profile
		} catch {
			setUser(null)
			return null
		}
	}, [])

	useEffect(() => {
		void loadUser().finally(() => setLoading(false))
	}, [loadUser])

	const login = useCallback(
		(destination?: string) => {
			void loadUser().then((profile) => {
				if (profile) router.push(safeDestination(destination))
			})
		},
		[loadUser, router]
	)

	const refresh = useCallback(async () => {
		await loadUser()
	}, [loadUser])

	useEffect(() => {
		const endExpiredSession = () => {
			setUser((current) => {
				if (current) {
					toast.error("Your session expired. Sign in again to continue.")
					router.push("/login")
				}
				return null
			})
		}

		window.addEventListener(SESSION_EXPIRED_EVENT, endExpiredSession)
		return () =>
			window.removeEventListener(SESSION_EXPIRED_EVENT, endExpiredSession)
	}, [router])

	const logout = useCallback((): void => {
		const endSession = async (): Promise<void> => {
			await api.post("/api/auth/logout").catch(ignoreFailure)
			setUser(null)
			router.push("/login")
		}
		void endSession()
	}, [router])

	const value = useMemo(
		() => ({
			user,
			isAuthenticated: !!user,
			login,
			logout,
			refresh,
			loading,
		}),
		[user, loading, login, logout, refresh]
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
