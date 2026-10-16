"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Link2, Loader2, Plus, Shield, ShieldX, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { CopyableLink } from "@/components/CopyableLink"
import { ProjectRoleIcon } from "@/components/ProjectRoleIcon"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

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

const SHARE_LINK_ROLE_LABELS: Record<ShareLinkRole, string> = {
	EDITOR: "Editor access",
	MEMBER: "Member access",
	VIEWER: "Viewer access",
}

const DEFAULT_EXPIRY_CHOICE = "7"

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

const joinUrlFor = (token: string): string =>
	`${window.location.origin}/join/${token}`

export function ShareLinksSection({ projectId }: { projectId: string }) {
	const [shareLinks, setShareLinks] = useState<ShareLink[]>([])
	const [isLoadingLinks, setIsLoadingLinks] = useState(true)
	const [issuedLink, setIssuedLink] = useState<IssuedShareLink | null>(null)
	const [newLinkRole, setNewLinkRole] = useState<ShareLinkRole>("EDITOR")
	const [newLinkExpiry, setNewLinkExpiry] = useState(DEFAULT_EXPIRY_CHOICE)
	const [newLinkMaxUses, setNewLinkMaxUses] = useState("")
	const [isCreatingLink, setIsCreatingLink] = useState(false)

	useEffect(() => {
		let cancelled = false
		setIsLoadingLinks(true)
		api
			.get<ShareLink[]>(`/api/projects/${projectId}/share-links`)
			.then((links) => {
				if (!cancelled) setShareLinks(links)
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(describeError(error, "Could not load share links."))
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoadingLinks(false)
			})
		return () => {
			cancelled = true
		}
	}, [projectId])

	const revokeLink = async (linkId: string) => {
		try {
			await api.delete(`/api/projects/${projectId}/share-links/${linkId}`)
			setShareLinks((links) => links.filter((link) => link.id !== linkId))
			setIssuedLink((current) => (current?.id === linkId ? null : current))
		} catch (error) {
			toast.error(describeError(error, "Could not revoke the share link."))
		}
	}

	const createLink = async () => {
		const maxUses = Number.parseInt(newLinkMaxUses, 10)
		setIsCreatingLink(true)
		try {
			const newLink = await api.post<IssuedShareLink>(
				`/api/projects/${projectId}/share-links`,
				{
					role: newLinkRole,
					expiresInDays:
						newLinkExpiry === "never" ? null : Number.parseInt(newLinkExpiry, 10),
					...(Number.isFinite(maxUses) && maxUses > 0 ? { maxUses } : {}),
				}
			)
			setShareLinks((links) => [summaryOf(newLink), ...links])
			setIssuedLink(newLink)
			setNewLinkMaxUses("")
		} catch (error) {
			toast.error(describeError(error, "Could not create the share link."))
		} finally {
			setIsCreatingLink(false)
		}
	}

	return (
		<div className="space-y-3 pt-2">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium text-muted-foreground">SHARE LINKS</h3>
				<span className="text-xs text-muted-foreground">
					{shareLinks.length} {shareLinks.length === 1 ? "link" : "links"}
				</span>
			</div>

			{isLoadingLinks ? (
				<div className="flex items-center justify-center py-6">
					<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
					<span className="sr-only">Loading share links</span>
				</div>
			) : (
				<>
					{issuedLink && (
						<div className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-3">
							<p className="text-sm font-medium">Copy this link now</p>
							<p className="mb-2 mt-0.5 text-xs text-muted-foreground">
								Sculpt stores only a hash of it, so this is the one time it can be
								shown. Revoke and create a new link if you lose it.
							</p>
							<CopyableLink url={joinUrlFor(issuedLink.token)} label="New share link" />
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
												<ProjectRoleIcon role={link.role} />
											</div>
											<div className="flex items-center gap-1 text-xs text-muted-foreground">
												<ExternalLink className="h-3 w-3" aria-hidden="true" />
												<span>Link shown once, when created</span>
											</div>
											<span className="text-xs text-muted-foreground">
												{shareLinkLimits(link)}
											</span>
										</div>
									</div>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													onClick={() => void revokeLink(link.id)}
													aria-label={`Revoke ${SHARE_LINK_ROLE_LABELS[link.role].toLowerCase()} link`}
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
							))
						) : (
							<div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/50 py-6">
								<Link2 className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
								<p className="text-sm font-medium">No share links created yet</p>
								<p className="text-xs text-muted-foreground">
									Create a link to share with others
								</p>
							</div>
						)}
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Select
							value={newLinkRole}
							onValueChange={(value: ShareLinkRole) => setNewLinkRole(value)}
						>
							<SelectTrigger className="h-9 w-[110px]" aria-label="Role granted by the link">
								<SelectValue placeholder="Role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="EDITOR" className="flex items-center gap-1.5">
									<Shield className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
									<span>Editor</span>
								</SelectItem>
								<SelectItem value="MEMBER" className="flex items-center gap-1.5">
									<Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
									<span>Member</span>
								</SelectItem>
								<SelectItem value="VIEWER" className="flex items-center gap-1.5">
									<ShieldX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
									<span>Viewer</span>
								</SelectItem>
							</SelectContent>
						</Select>
						<Select value={newLinkExpiry} onValueChange={setNewLinkExpiry}>
							<SelectTrigger className="h-9 w-[110px]" aria-label="Link expiry">
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
							onChange={(event) => setNewLinkMaxUses(event.target.value)}
						/>
						<Button
							onClick={() => void createLink()}
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
	)
}
