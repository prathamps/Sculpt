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
import { Label } from "@/components/ui/label"
import { Project, ProjectMember } from "@/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { cn } from "@/lib/utils"

interface MembersModalProps {
	isOpen: boolean
	onClose: () => void
	project: Project | null
	onMembersChanged: () => void
}

interface ShareLink {
	id: string
	token: string
	role: "EDITOR" | "VIEWER"
}

export function MembersModal({
	isOpen,
	onClose,
	project,
	onMembersChanged,
}: MembersModalProps) {
	const { user: currentUser } = useAuth()
	const [email, setEmail] = useState("")
	const [error, setError] = useState("")
	const [isInviting, setIsInviting] = useState(false)
	const [shareLinks, setShareLinks] = useState<ShareLink[]>([])
	const [newLinkRole, setNewLinkRole] = useState<"EDITOR" | "VIEWER">("EDITOR")
	const [copiedToken, setCopiedToken] = useState<string | null>(null)
	const [isLoadingLinks, setIsLoadingLinks] = useState(false)
	const [isCreatingLink, setIsCreatingLink] = useState(false)
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
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

	const handleCopy = (token: string) => {
		const url = `${window.location.origin}/join/${token}`
		navigator.clipboard.writeText(url)
		setCopiedToken(token)
		setTimeout(() => setCopiedToken(null), 2000)
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
			} else {
				alert("Failed to revoke share link.")
			}
		} catch (error) {
			alert("An error occurred while revoking the share link.")
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
				alert(data.message || "Failed to remove member.")
			}
		} catch (err) {
			alert("An unexpected error occurred.")
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
				setEmail("")
				onMembersChanged()
			} else {
				const data = await res.json()
				setError(data.message || "Failed to invite user.")
			}
		} catch (err) {
			setError("An unexpected error occurred.")
		} finally {
			setIsInviting(false)
		}
	}

	const handleCreateShareLink = async () => {
		setIsCreatingLink(true)
		try {
			const res = await fetch(`${URI}/api/projects/${project.id}/share-links`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ role: newLinkRole }),
			})
			if (res.ok) {
				const newLink = await res.json()
				setShareLinks((prev) => [...prev, newLink])
			} else {
				alert("Failed to create share link.")
			}
		} catch (error) {
			alert("An error occurred while creating the share link.")
		} finally {
			setIsCreatingLink(false)
		}
	}

	const getRoleIcon = (role: string) => {
		switch (role) {
			case "OWNER":
				return <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
			case "EDITOR":
				return <Shield className="h-3.5 w-3.5 text-blue-500" />
			case "VIEWER":
				return <ShieldX className="h-3.5 w-3.5 text-gray-500" />
			default:
				return <BadgeAlert className="h-3.5 w-3.5" />
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

				{/* Members List */}
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
									<Avatar className="h-8 w-8">
										<AvatarImage
											src={`https://api.dicebear.com/7.x/micah/svg?seed=${member.user.email}`}
											alt={member.user.name ?? member.user.email}
										/>
										<AvatarFallback>
											{member.user.name?.charAt(0).toUpperCase() ??
												member.user.email.charAt(0).toUpperCase()}
										</AvatarFallback>
									</Avatar>
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
														<Trash2 className="h-3.5 w-3.5" />
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

				{/* Invite Form */}
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
										<UserPlus className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
									</div>
									<Button
										type="submit"
										disabled={isInviting || !email}
										size="sm"
										className="h-9"
									>
										{isInviting ? (
											<>
												<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
												Inviting
											</>
										) : (
											"Invite"
										)}
									</Button>
								</div>
								{error && <p className="text-xs text-destructive">{error}</p>}
							</form>
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
									<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
								</div>
							) : (
								<>
									<div className="space-y-2">
										{shareLinks.length > 0 ? (
											shareLinks.map((link) => (
												<div
													key={link.id}
													className="flex items-center justify-between rounded-md border border-border/50 bg-card/50 p-2.5"
												>
													<div className="flex items-center gap-2">
														<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
															<Link2 className="h-4 w-4 text-primary" />
														</div>
														<div className="flex flex-col">
															<div className="flex items-center gap-1.5">
																<span className="text-sm font-medium">
																	{link.role === "EDITOR"
																		? "Editor access"
																		: "Viewer access"}
																</span>
																{getRoleIcon(link.role)}
															</div>
															<div className="flex items-center gap-1 text-xs text-muted-foreground">
																<ExternalLink className="h-3 w-3" />
																<span className="truncate max-w-[200px]">
																	{`${window.location.origin}/join/${link.token}`}
																</span>
															</div>
														</div>
													</div>
													<div className="flex items-center gap-1">
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		onClick={() => handleCopy(link.token)}
																		className={cn(
																			"h-7 w-7",
																			copiedToken === link.token
																				? "text-green-500"
																				: "text-muted-foreground"
																		)}
																	>
																		{copiedToken === link.token ? (
																			<Check className="h-3.5 w-3.5" />
																		) : (
																			<ClipboardCopy className="h-3.5 w-3.5" />
																		)}
																	</Button>
																</TooltipTrigger>
																<TooltipContent side="bottom">
																	<p className="text-xs">
																		{copiedToken === link.token
																			? "Copied!"
																			: "Copy link"}
																	</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>

														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		onClick={() => handleRevokeLink(link.id)}
																		className="h-7 w-7 text-muted-foreground hover:text-destructive"
																	>
																		<Trash2 className="h-3.5 w-3.5" />
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
												<Link2 className="mb-2 h-8 w-8 text-muted-foreground" />
												<p className="text-sm font-medium">
													No share links created yet
												</p>
												<p className="text-xs text-muted-foreground">
													Create a link to share with others
												</p>
											</div>
										)}
									</div>

									<div className="flex gap-2">
										<Select
											value={newLinkRole}
											onValueChange={(value: "EDITOR" | "VIEWER") =>
												setNewLinkRole(value)
											}
										>
											<SelectTrigger className="h-9 w-[120px]">
												<SelectValue placeholder="Role" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem
													value="EDITOR"
													className="flex items-center gap-1.5"
												>
													<Shield className="h-3.5 w-3.5 text-blue-500" />
													<span>Editor</span>
												</SelectItem>
												<SelectItem
													value="VIEWER"
													className="flex items-center gap-1.5"
												>
													<ShieldX className="h-3.5 w-3.5 text-gray-500" />
													<span>Viewer</span>
												</SelectItem>
											</SelectContent>
										</Select>
										<Button
											onClick={handleCreateShareLink}
											disabled={isCreatingLink}
											size="sm"
											className="h-9"
										>
											{isCreatingLink ? (
												<>
													<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
													Creating
												</>
											) : (
												<>
													<Plus className="mr-2 h-3.5 w-3.5" />
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

				<DialogFooter>
					<Button onClick={onClose} variant="secondary" size="sm">
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
