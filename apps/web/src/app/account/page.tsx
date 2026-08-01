"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, LogOut } from "lucide-react"
import { toast } from "sonner"
import { UserAvatar } from "@/components/UserAvatar"
import { AccountDataSection } from "@/components/AccountDataSection"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export default function AccountPage() {
	const { user, loading, isAuthenticated, refresh, logout } = useAuth()
	const router = useRouter()

	const [name, setName] = useState("")
	const [savingProfile, setSavingProfile] = useState(false)

	const [currentPassword, setCurrentPassword] = useState("")
	const [newPassword, setNewPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [savingPassword, setSavingPassword] = useState(false)

	useEffect(() => {
		if (!loading && !isAuthenticated) router.push("/login")
	}, [loading, isAuthenticated, router])

	useEffect(() => {
		if (user) setName(user.name || "")
	}, [user])

	const saveProfile = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!name.trim()) {
			toast.error("Name cannot be empty.")
			return
		}
		setSavingProfile(true)
		try {
			const res = await fetch(`${API_URL}/api/users/me`, {
				method: "PATCH",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: name.trim() }),
			})
			if (!res.ok) {
				const data = await res.json().catch(() => ({}))
				throw new Error(data.message || "Could not update profile")
			}
			await refresh()
			toast.success("Profile updated.")
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not update profile")
		} finally {
			setSavingProfile(false)
		}
	}

	const savePassword = async (e: React.FormEvent) => {
		e.preventDefault()
		if (newPassword !== confirmPassword) {
			toast.error("New passwords do not match.")
			return
		}
		setSavingPassword(true)
		try {
			const res = await fetch(`${API_URL}/api/users/me/password`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ currentPassword, newPassword }),
			})
			if (!res.ok) {
				const data = await res.json().catch(() => ({}))
				throw new Error(data.message || "Could not change password")
			}
			setCurrentPassword("")
			setNewPassword("")
			setConfirmPassword("")
			toast.success("Password changed.")
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not change password")
		} finally {
			setSavingPassword(false)
		}
	}

	if (loading || !user) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			</div>
		)
	}

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
				<h1 className="mb-6 text-2xl font-semibold">Account settings</h1>

				<div className="flex flex-col gap-6">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Profile</CardTitle>
						</CardHeader>
						<CardContent>
							<form onSubmit={saveProfile} className="flex flex-col gap-5">
								<div className="flex items-center gap-4">
									<UserAvatar
										className="h-16 w-16"
										fallbackClassName="text-lg"
										name={user.name}
										email={user.email}
										avatarUrl={user.avatarUrl}
									/>
									<div className="min-w-0">
										<p className="truncate font-medium">{user.name || user.email}</p>
										<p className="text-sm text-muted-foreground">
											{user.role === "ADMIN" ? "Administrator" : "Member"}
										</p>
									</div>
								</div>

								<div className="grid gap-2">
									<Label htmlFor="account-name">Display name</Label>
									<Input
										id="account-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										autoComplete="name"
									/>
								</div>

								<div className="grid gap-2">
									<Label htmlFor="account-email">Email</Label>
									<Input
										id="account-email"
										type="email"
										value={user.email}
										disabled
										aria-describedby="email-hint"
									/>
									<p id="email-hint" className="text-xs text-muted-foreground">
										Your email address can&apos;t be changed.
									</p>
								</div>

								<div className="flex justify-end">
									<Button type="submit" disabled={savingProfile}>
										{savingProfile ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Saving...
											</>
										) : (
											"Save changes"
										)}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Change password</CardTitle>
						</CardHeader>
						<CardContent>
							<form onSubmit={savePassword} className="flex flex-col gap-5">
								<div className="grid gap-2">
									<Label htmlFor="current-password">Current password</Label>
									<Input
										id="current-password"
										type="password"
										value={currentPassword}
										onChange={(e) => setCurrentPassword(e.target.value)}
										autoComplete="current-password"
										required
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="new-password">New password</Label>
									<Input
										id="new-password"
										type="password"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										autoComplete="new-password"
										required
										minLength={8}
									/>
									<p className="text-xs text-muted-foreground">
										At least 8 characters.
									</p>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="confirm-password">Confirm new password</Label>
									<Input
										id="confirm-password"
										type="password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										autoComplete="new-password"
										required
										minLength={8}
									/>
								</div>
								<div className="flex justify-end">
									<Button type="submit" disabled={savingPassword}>
										{savingPassword ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Updating...
											</>
										) : (
											"Update password"
										)}
									</Button>
								</div>
							</form>
						</CardContent>
					</Card>

					<AccountDataSection />

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Session</CardTitle>
						</CardHeader>
						<CardContent>
							<Button variant="outline" onClick={logout} className="gap-2">
								<LogOut className="h-4 w-4" aria-hidden="true" />
								Log out
							</Button>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	)
}
