"use client"

import { useState, useEffect } from "react"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Project } from "@/types"
import { useAuth } from "@/context/AuthContext"
import {
	Trash2,
	Link2,
	Plus,
	ClipboardCopy,
	Check,
	UserPlus,
	ExternalLink,
	Loader2,
	Shield,
	ShieldCheck,
	ShieldX,
	BadgeAlert,
} from "lucide-react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { UserAvatar } from "@/components/UserAvatar"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { LogOut } from "lucide-react"

interface MembersModalProps {
	isOpen: boolean
	onClose: () => void
	project: Project | null
	onMembersChanged: () => void
}

type ShareLinkRole = "EDITOR" | "MEMBER" | "VIEWER"

interface ShareLink {
	id: string
	role: ShareLinkRole
	createdAt?: string
	expiresAt?: string | null
	maxUses?: number | null
	useCount?: number
}

interface IssuedShareLink extends ShareLink {
	token: string
}

const summaryOf = (link: IssuedShareLink): ShareLink => ({
	id: link.id,
	role: link.role,
	createdAt: link.createdAt,
	expiresAt: link.expiresAt,
	maxUses: link.maxUses,
	useCount: link.useCount,
})

const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

const SHARE_LINK_ROLE_LABELS: Record<ShareLinkRole, string> = {
	EDITOR: "Editor access",
	MEMBER: "Member access",
	VIEWER: "Viewer access",
}

const EXPIRY_CHOICES = [
	{ value: "never", label: "No expiry" },
	{ value: "1", label: "1 day" },
	{ value: "7", label: "7 days" },
	{ value: "30", label: "30 days" },
]

const shareLinkLimits = (link: ShareLink): string => {
	const expiry = link.expiresAt
		? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
		: "No expiry"
	const uses =
		typeof link.maxUses === "number"
			? ` · ${link.useCount ?? 0}/${link.maxUses} uses`
			: ""
	return expiry + uses
}

export function MembersModal({
	isOpen,
	onClose,
	project,
	onMembersChanged,
}: MembersModalProps) {
	const { user: currentUser } = useAuth()
	const router = useRouter()
	const [email, setEmail] = useState("")
	const [error, setError] = useState("")
	const [isInviting, setIsInviting] = useState(false)
	const [shareLinks, setShareLinks] = useState<ShareLink[]>([])
	const [newLinkRole, setNewLinkRole] = useState<ShareLinkRole>("EDITOR")
	const [newLinkExpiry, setNewLinkExpiry] = useState("never")
	const [newLinkMaxUses, setNewLinkMaxUses] = useState("")
	const [pendingInvite, setPendingInvite] = useState<{
		email: string
		acceptUrl: string
		emailDelivered: boolean
	} | null>(null)
	const [hasCopiedInvite, setHasCopiedInvite] = useState(false)
	const [isLeaving, setIsLeaving] = useState(false)
	const [isConfirmingLeave, setIsConfirmingLeave] = useState(false)
	const [issuedLink, setIssuedLink] = useState<IssuedShareLink | null>(null)
	const [hasCopiedIssuedLink, setHasCopiedIssuedLink] = useState(false)
	const [isLoadingLinks, setIsLoadingLinks] = useState(false)
	const [isCreatingLink, setIsCreatingLink] = useState(false)
	useEffect(() => {
		if (project && isOpen) {
			const fetchShareLinks = async () => {
				setIsLoadingLinks(true)
				try {
					const res = await fetch(
						`${URI}/api/projects/${project.id}/share-links`,
						{ credentials: "include" }
					)
					if (res.ok) {
						setShareLinks(await res.json())
					}
				} catch (error) {
					console.error("Failed to fetch share links:", error)
				} finally {
					setIsLoadingLinks(false)
				}
			}
			fetchShareLinks()
		}
	}, [project, isOpen])

	if (!project || !currentUser) return null

	const amIOwner = project.members.some(
		(m) => m.user.id === currentUser.id && m.role === "OWNER"
	)

	const ownerCount = project.members.filter((m) => m.role === "OWNER").length
	const isMember = project.members.some((m) => m.user.id === currentUser.id)
	const canLeaveProject = isMember && (!amIOwner || ownerCount > 1)

	const handleCopyInvite = () => {
		if (!pendingInvite) return
		navigator.clipboard.writeText(pendingInvite.acceptUrl)
		setHasCopiedInvite(true)
		setTimeout(() => setHasCopiedInvite(false), 2000)
	}

	const issuedLinkUrl = issuedLink
		? `${window.location.origin}/join/${issuedLink.token}`
		: null

	const handleCopyIssuedLink = () => {
		if (!issuedLinkUrl) return
		navigator.clipboard.writeText(issuedLinkUrl)
		setHasCopiedIssuedLink(true)
		setTimeout(() => setHasCopiedIssuedLink(false), 2000)
	}

	const handleRevokeLink = async (linkId: string) => {
		try {
			const res = await fetch(
				`${URI}/api/projects/${project.id}/share-links/${linkId}`,
				{
					method: "DELETE",
					credentials: "include",
				}
			)
			if (res.ok) {
				setShareLinks((prev) => prev.filter((l) => l.id !== linkId))
				setIssuedLink((current) => (current?.id === linkId ? null : current))
			} else {
				toast.error("Could not revoke the share link.")
			}
		} catch {
			toast.error("Could not revoke the share link.")
		}
	}

	const handleRemoveMember = async (userId: string) => {
		try {
			const res = await fetch(
				`${URI}/api/projects/${project.id}/members/${userId}`,
				{ method: "DELETE", credentials: "include" }
			)
			if (res.ok) {
				onMembersChanged()
			} else {
				const data = await res.json()
				toast.error(data.message || "Could not remove that member.")
			}
		} catch {
			toast.error("Could not remove that member.")
		}
	}

	const handleLeaveProject = async () => {
		setIsLeaving(true)
		try {
			await api.post(`/api/projects/${project.id}/members/leave`)
			toast.success(`You left "${project.name}".`)
			onClose()
			router.push("/dashboard")
		} catch (error) {
			toast.error(describeError(error, "Could not leave this project."))
		} finally {
			setIsLeaving(false)
			setIsConfirmingLeave(false)
		}
	}

	const handleInvite = async (e: React.FormEvent) => {
		e.preventDefault()
		setError("")
		setIsInviting(true)
		try {
			const res = await fetch(`${URI}/api/projects/${project.id}/invite`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify({ email }),
			})

			if (res.ok) {
				const invitation = (await res.json()) as {
					invitedExistingUser?: boolean
					email?: string
					acceptUrl?: string
					emailDelivered?: boolean
				}
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
				onMembersChanged()
			} else {
				const data = await res.json()
				setError(data.message || "Failed to invite user.")
			}
		} catch {
			setError("An unexpected error occurred.")
		} finally {
			setIsInviting(false)
		}
	}

	const handleCreateShareLink = async () => {
		const maxUses = Number.parseInt(newLinkMaxUses, 10)
		setIsCreatingLink(true)
		try {
			const newLink = await api.post<IssuedShareLink>(
				`/api/projects/${project.id}/share-links`,
				{
					role: newLinkRole,
					...(newLinkExpiry === "never"
						? {}
						: { expiresInDays: Number.parseInt(newLinkExpiry, 10) }),
					...(Number.isFinite(maxUses) && maxUses > 0 ? { maxUses } : {}),
				}
			)
			setShareLinks((prev) => [summaryOf(newLink), ...prev])
			setIssuedLink(newLink)
			setHasCopiedIssuedLink(false)
			setNewLinkMaxUses("")
		} catch (error) {
			toast.error(describeError(error, "Could not create the share link."))
		} finally {
			setIsCreatingLink(false)
		}
	}

	const getRoleIcon = (role: string) => {
		switch (role) {
			case "OWNER":
				return (
					<ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
				)
			case "EDITOR":
				return (
					<Shield
						className="h-3.5 w-3.5 text-muted-foreground"
						aria-hidden="true"
					/>
				)
			case "VIEWER":
				return <ShieldX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
			default:
				return <BadgeAlert className="h-3.5 w-3.5" aria-hidden="true" />
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle className="text-xl font-semibold">
						Manage Members
					</DialogTitle>
					<DialogDescription>
						Manage members and create sharing links for &quot;{project.name}
						&quot;
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 pt-2">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-medium text-muted-foreground">
							PROJECT MEMBERS
						</h3>
						<span className="text-xs text-muted-foreground">
							{project.members.length} members
						</span>
					</div>

					<div className="divide-y divide-border/30 rounded-md border border-border/50 overflow-hidden">
						{project.members.map((member) => (
							<div
								key={member.user.id}
								className="flex items-center justify-between px-3 py-2.5 bg-card/50"
							>
								<div className="flex items-center gap-2.5">
									<UserAvatar
										className="h-8 w-8"
										name={member.user.name}
										email={member.user.email}
										avatarUrl={member.user.avatarUrl}
									/>
									<div>
										<p className="text-sm font-medium">
											{member.user.name || "Unnamed user"}
										</p>
										<p className="text-xs text-muted-foreground">
											{member.user.email}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<div className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-xs">
										{getRoleIcon(member.role)}
										<span>{member.role}</span>
									</div>
									{amIOwner && member.role !== "OWNER" && (
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														onClick={() => handleRemoveMember(member.user.id)}
														className="h-7 w-7 text-muted-foreground hover:text-destructive"
													>
														<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
													</Button>
												</TooltipTrigger>
												<TooltipContent side="left">
													<p className="text-xs">Remove member</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									)}
								</div>
							</div>
						))}
					</div>
				</div>

				{amIOwner && (
					<>
						<div className="space-y-3 pt-2">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-medium text-muted-foreground">
									INVITE MEMBERS
								</h3>
							</div>

							<form onSubmit={handleInvite} className="space-y-2">
								<div className="flex gap-2">
									<div className="relative flex-1">
										<Input
											id="email"
											type="email"
											placeholder="Enter email address"
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											required
											className="pr-8"
										/>
										<UserPlus className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
									<p className="text-xs font-medium">
										{pendingInvite.emailDelivered
											? `Invitation emailed to ${pendingInvite.email}`
											: `No mail server is configured, so send this link to ${pendingInvite.email} yourself`}
									</p>
									<div className="mt-1.5 flex items-center gap-2">
										<Input
											readOnly
											value={pendingInvite.acceptUrl}
											aria-label={`Invitation link for ${pendingInvite.email}`}
											className="h-8 font-mono text-xs"
											onFocus={(event) => event.currentTarget.select()}
										/>
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="h-8 shrink-0 gap-1"
											onClick={handleCopyInvite}
										>
											{hasCopiedInvite ? (
												<Check className="h-3.5 w-3.5" aria-hidden="true" />
											) : (
												<ClipboardCopy
													className="h-3.5 w-3.5"
													aria-hidden="true"
												/>
											)}
											{hasCopiedInvite ? "Copied" : "Copy"}
										</Button>
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										The link only works for that address and expires in 7 days.
									</p>
								</div>
							)}
						</div>

						<Separator className="my-1" />

						<div className="space-y-3 pt-2">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-medium text-muted-foreground">
									SHARE LINKS
								</h3>
								<span className="text-xs text-muted-foreground">
									{shareLinks.length}{" "}
									{shareLinks.length === 1 ? "link" : "links"}
								</span>
							</div>

							{isLoadingLinks ? (
								<div className="flex items-center justify-center py-6">
									<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
								</div>
							) : (
								<>
									{issuedLink && issuedLinkUrl && (
										<div className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-3">
											<p className="text-sm font-medium">
												Copy this link now
											</p>
											<p className="mt-0.5 text-xs text-muted-foreground">
												Sculpt stores only a hash of it, so this is the one
												time it can be shown. Revoke and create a new link if
												you lose it.
											</p>
											<div className="mt-2 flex items-center gap-2">
												<Input
													readOnly
													value={issuedLinkUrl}
													aria-label="New share link"
													className="h-8 font-mono text-xs"
													onFocus={(event) => event.currentTarget.select()}
												/>
												<Button
													size="sm"
													variant="outline"
													className="h-8 shrink-0 gap-1"
													onClick={handleCopyIssuedLink}
												>
													{hasCopiedIssuedLink ? (
														<Check className="h-3.5 w-3.5" aria-hidden="true" />
													) : (
														<ClipboardCopy
															className="h-3.5 w-3.5"
															aria-hidden="true"
														/>
													)}
													{hasCopiedIssuedLink ? "Copied" : "Copy"}
												</Button>
											</div>
										</div>
									)}
									<div className="space-y-2">
										{shareLinks.length > 0 ? (
											shareLinks.map((link) => (
												<div
													key={link.id}
													className="flex items-center justify-between rounded-md border border-border/50 bg-card/50 p-2.5"
												>
													<div className="flex items-center gap-2">
														<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
															<Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
														</div>
														<div className="flex flex-col">
															<div className="flex items-center gap-1.5">
																<span className="text-sm font-medium">
																	{SHARE_LINK_ROLE_LABELS[link.role]}
																</span>
																{getRoleIcon(link.role)}
															</div>
															<div className="flex items-center gap-1 text-xs text-muted-foreground">
																<ExternalLink
																	className="h-3 w-3"
																	aria-hidden="true"
																/>
																<span>Link shown once, when created</span>
															</div>
															<span className="text-xs text-muted-foreground">
																{shareLinkLimits(link)}
															</span>
														</div>
													</div>
													<div className="flex items-center gap-1">
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		onClick={() => handleRevokeLink(link.id)}
																		className="h-7 w-7 text-muted-foreground hover:text-destructive"
																	>
																		<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent side="bottom">
																	<p className="text-xs">Revoke link</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													</div>
												</div>
											))
										) : (
											<div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/50 py-6">
												<Link2 className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
												<p className="text-sm font-medium">
													No share links created yet
												</p>
												<p className="text-xs text-muted-foreground">
													Create a link to share with others
												</p>
											</div>
										)}
									</div>

									<div className="flex flex-wrap items-center gap-2">
										<Select
											value={newLinkRole}
											onValueChange={(value: ShareLinkRole) =>
												setNewLinkRole(value)
											}
										>
											<SelectTrigger
												className="h-9 w-[110px]"
												aria-label="Role granted by the link"
											>
												<SelectValue placeholder="Role" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem
													value="EDITOR"
													className="flex items-center gap-1.5"
												>
													<Shield
														className="h-3.5 w-3.5 text-muted-foreground"
														aria-hidden="true"
													/>
													<span>Editor</span>
												</SelectItem>
												<SelectItem
													value="MEMBER"
													className="flex items-center gap-1.5"
												>
													<Shield className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
													<span>Member</span>
												</SelectItem>
												<SelectItem
													value="VIEWER"
													className="flex items-center gap-1.5"
												>
													<ShieldX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
													<span>Viewer</span>
												</SelectItem>
											</SelectContent>
										</Select>
										<Select value={newLinkExpiry} onValueChange={setNewLinkExpiry}>
											<SelectTrigger
												className="h-9 w-[110px]"
												aria-label="Link expiry"
											>
												<SelectValue placeholder="Expiry" />
											</SelectTrigger>
											<SelectContent>
												{EXPIRY_CHOICES.map((choice) => (
													<SelectItem key={choice.value} value={choice.value}>
														{choice.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Input
											type="number"
											min={1}
											max={1000}
											placeholder="Max uses"
											aria-label="Maximum number of uses (blank for unlimited)"
											className="h-9 w-[100px]"
											value={newLinkMaxUses}
											onChange={(e) => setNewLinkMaxUses(e.target.value)}
										/>
										<Button
											onClick={handleCreateShareLink}
											disabled={isCreatingLink}
											size="sm"
											className="h-9"
										>
											{isCreatingLink ? (
												<>
													<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
													Creating
												</>
											) : (
												<>
													<Plus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
													Create Link
												</>
											)}
										</Button>
									</div>
								</>
							)}
						</div>
					</>
				)}

				<DialogFooter className="sm:justify-between">
					{canLeaveProject ? (
						<Button
							onClick={() => setIsConfirmingLeave(true)}
							variant="ghost"
							size="sm"
							className="gap-1.5 text-destructive hover:text-destructive"
						>
							<LogOut className="h-3.5 w-3.5" aria-hidden="true" />
							Leave project
						</Button>
					) : (
						<span />
					)}
					<Button onClick={onClose} variant="secondary" size="sm">
						Close
					</Button>
				</DialogFooter>
			</DialogContent>

			<ConfirmationModal
				isOpen={isConfirmingLeave}
				onClose={() => setIsConfirmingLeave(false)}
				onConfirm={handleLeaveProject}
				title={`Leave "${project.name}"?`}
				description="You will lose access to its files and comments. An owner has to invite you back."
				confirmText="Leave project"
				isConfirming={isLeaving}
			/>
		</Dialog>
	)
}
