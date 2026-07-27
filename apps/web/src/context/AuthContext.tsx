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
import { api } from "@/lib/api"
import { ignoreFailure } from "@/lib/errors"

interface User {
	id: string
	name: string
	email: string
	role: "USER" | "ADMIN"
	avatarUrl?: string | null
	emailNotifications?: boolean
}

interface AuthContextType {
	user: User | null
	isAuthenticated: boolean
	login: () => void
	logout: () => void
	refresh: () => Promise<void>
	loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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

	const login = useCallback(() => {
		void loadUser().then((profile) => {
			if (profile) router.push("/dashboard")
		})
	}, [loadUser, router])

	const refresh = useCallback(async () => {
		await loadUser()
	}, [loadUser])

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
