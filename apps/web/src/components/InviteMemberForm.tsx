"use client"

import { useState } from "react"
import { Loader2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CopyableLink } from "@/components/CopyableLink"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

interface InvitationResponse {
	email?: string
	acceptUrl?: string
	emailDelivered?: boolean
}

interface PendingInvite {
	email: string
	acceptUrl: string
	emailDelivered: boolean
}

interface InviteMemberFormProps {
	projectId: string
	onInvited: () => void
}

export function InviteMemberForm({ projectId, onInvited }: InviteMemberFormProps) {
	const [email, setEmail] = useState("")
	const [error, setError] = useState("")
	const [isInviting, setIsInviting] = useState(false)
	const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null)

	const invite = async (event: React.FormEvent) => {
		event.preventDefault()
		setError("")
		setIsInviting(true)
		try {
			const invitation = await api.post<InvitationResponse>(
				`/api/projects/${projectId}/invite`,
				{ email }
			)
			setEmail("")
			setPendingInvite(
				invitation.acceptUrl
					? {
							email: invitation.email ?? "",
							acceptUrl: invitation.acceptUrl,
							emailDelivered: !!invitation.emailDelivered,
						}
					: null
			)
			toast.success(
				invitation.emailDelivered
					? `Invitation emailed to ${invitation.email}. They join once they accept.`
					: `Invitation created for ${invitation.email}. Send them the link below.`
			)
			onInvited()
		} catch (caught) {
			setError(describeError(caught, "Failed to invite user."))
		} finally {
			setIsInviting(false)
		}
	}

	return (
		<div className="space-y-3 pt-2">
			<h3 className="text-sm font-medium text-muted-foreground">INVITE MEMBERS</h3>

			<form onSubmit={invite} className="space-y-2">
				<div className="flex gap-2">
					<div className="relative flex-1">
						<Input
							id="email"
							type="email"
							placeholder="Enter email address"
							aria-label="Email address to invite"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
							className="pr-8"
						/>
						<UserPlus
							className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>
					<Button
						type="submit"
						disabled={isInviting || !email}
						size="sm"
						className="h-9"
					>
						{isInviting ? (
							<>
								<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
								Inviting
							</>
						) : (
							"Invite"
						)}
					</Button>
				</div>
				{error && <p className="text-xs text-destructive">{error}</p>}
			</form>

			{pendingInvite && (
				<div className="mt-2 rounded-md border border-border bg-muted/40 p-2.5">
					<p className="mb-1.5 text-xs font-medium">
						{pendingInvite.emailDelivered
							? `Invitation emailed to ${pendingInvite.email}`
							: `No mail server is configured, so send this link to ${pendingInvite.email} yourself`}
					</p>
					<CopyableLink
						url={pendingInvite.acceptUrl}
						label={`Invitation link for ${pendingInvite.email}`}
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						The link only works for that address and expires in 7 days.
					</p>
				</div>
			)}
		</div>
	)
}
