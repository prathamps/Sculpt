"use client"

import { useState } from "react"
import { Download, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { API_URL, api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { useAuth } from "@/context/AuthContext"

export function AccountDataSection() {
	const { user, refresh, logout } = useAuth()
	const [emailNotifications, setEmailNotifications] = useState(
		user?.emailNotifications ?? true
	)
	const [isSavingPreference, setIsSavingPreference] = useState(false)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [password, setPassword] = useState("")
	const [deleteOwnedProjects, setDeleteOwnedProjects] = useState(false)

	const savePreference = async (next: boolean) => {
		setEmailNotifications(next)
		setIsSavingPreference(true)
		try {
			await api.patch("/api/users/me/notification-preferences", {
				emailNotifications: next,
			})
			await refresh()
			toast.success(
				next
					? "Email notifications are on."
					: "Email notifications are off. You'll still see in-app notifications."
			)
		} catch (error) {
			setEmailNotifications(!next)
			toast.error(describeError(error, "Could not save that preference."))
		} finally {
			setIsSavingPreference(false)
		}
	}

	const deleteAccount = async () => {
		setIsDeleting(true)
		try {
			await api.delete("/api/users/me", {
				password: password || undefined,
				deleteOwnedProjects,
			})
			toast.success("Your account has been deleted.")
			logout()
		} catch (error) {
			toast.error(describeError(error, "Could not delete your account."))
		} finally {
			setIsDeleting(false)
		}
	}

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Notifications</CardTitle>
					<CardDescription>
						In-app notifications are always on. Email is only used when
						you&apos;re offline.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor="email-notifications" className="font-normal">
							Email me about activity when I&apos;m offline
						</Label>
						<Switch
							id="email-notifications"
							checked={emailNotifications}
							disabled={isSavingPreference}
							onCheckedChange={savePreference}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Your data</CardTitle>
					<CardDescription>
						Download everything Sculpt holds about your account.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button asChild variant="outline" className="gap-2">
						<a href={`${API_URL}/api/users/me/export`} download>
							<Download className="h-4 w-4" aria-hidden="true" />
							Download my data
						</a>
					</Button>
				</CardContent>
			</Card>

			<Card className="border-destructive/40">
				<CardHeader>
					<CardTitle className="text-base text-destructive">
						Delete account
					</CardTitle>
					<CardDescription>
						This permanently removes your profile, comments and reviews. Projects
						you solely own are deleted with all their media.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="outline"
						className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
						onClick={() => setIsConfirmingDelete(true)}
					>
						<Trash2 className="h-4 w-4" aria-hidden="true" />
						Delete my account
					</Button>
				</CardContent>
			</Card>

			<ConfirmationModal
				isOpen={isConfirmingDelete}
				onClose={() => setIsConfirmingDelete(false)}
				onConfirm={deleteAccount}
				title="Delete your account"
				description="This cannot be undone. Your comments, reviews and any projects you solely own will be removed permanently."
				isConfirming={isDeleting}
			>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor="delete-password">
							Confirm your password
						</Label>
						<Input
							id="delete-password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="Leave blank if you sign in with Google or GitHub"
						/>
					</div>
					<label className="flex items-start gap-2 text-sm">
						<input
							type="checkbox"
							className="mt-0.5"
							checked={deleteOwnedProjects}
							onChange={(event) =>
								setDeleteOwnedProjects(event.target.checked)
							}
						/>
						<span className="text-muted-foreground">
							I understand projects I solely own will be deleted along with all
							their media.
						</span>
					</label>
					{isDeleting && (
						<p className="flex items-center gap-2 text-xs text-muted-foreground">
							<Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
							Deleting your account…
						</p>
					)}
				</div>
			</ConfirmationModal>
		</>
	)
}
