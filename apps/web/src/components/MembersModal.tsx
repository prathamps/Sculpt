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
import { Trash2, Link2, Plus, ClipboardCopy, Check } from "lucide-react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

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

	useEffect(() => {
		if (project && isOpen) {
			const fetchShareLinks = async () => {
				const res = await fetch(
					`http://localhost:3001/api/projects/${project.id}/share-links`,
					{ credentials: "include" }
				)
				if (res.ok) {
					setShareLinks(await res.json())
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
				`http://localhost:3001/api/projects/${project.id}/share-links/${linkId}`,
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
				`http://localhost:3001/api/projects/${project.id}/members/${userId}`,
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
			const res = await fetch(
				`http://localhost:3001/api/projects/${project.id}/invite`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({ email }),
				}
			)

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
		try {
			const res = await fetch(
				`http://localhost:3001/api/projects/${project.id}/share-links`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ role: newLinkRole }),
				}
			)
			if (res.ok) {
				const newLink = await res.json()
				setShareLinks((prev) => [...prev, newLink])
			} else {
				alert("Failed to create share link.")
			}
		} catch (error) {
			alert("An error occurred while creating the share link.")
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[425px] bg-gray-900 text-white border-gray-800">
				<DialogHeader>
					<DialogTitle>Manage Members</DialogTitle>
					<DialogDescription>
						View members and invite new ones to collaborate on &quot;
						{project.name}&quot;.
					</DialogDescription>
				</DialogHeader>

				{/* Members List */}
				<div className="space-y-4 py-4">
					<h3 className="text-lg font-semibold">Current Members</h3>
					<div className="space-y-3">
						{project.members.map((member) => (
							<div
								key={member.user.id}
								className="flex items-center justify-between"
							>
								<div className="flex items-center gap-3">
									<Avatar>
										<AvatarImage
											src={`https://api.dicebear.com/8.x/lorelei/svg?seed=${member.user.email}`}
											alt={member.user.name ?? member.user.email}
										/>
										<AvatarFallback>
											{member.user.name?.charAt(0).toUpperCase() ??
												member.user.email.charAt(0).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<div>
										<p className="font-semibold">{member.user.name}</p>
										<p className="text-sm text-gray-400">{member.user.email}</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-sm text-gray-500">{member.role}</span>
									{amIOwner && member.role !== "OWNER" && (
										<Button
											variant="ghost"
											size="icon"
											onClick={() => handleRemoveMember(member.user.id)}
											className="text-gray-500 hover:text-red-500"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Invite Form */}
				{amIOwner && (
					<>
						<form onSubmit={handleInvite} className="mt-6">
							<div className="space-y-2">
								<Label htmlFor="email">Invite by email</Label>
								<div className="flex gap-2">
									<Input
										id="email"
										type="email"
										placeholder="person@example.com"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
										className="bg-gray-800 border-gray-700"
									/>
									<Button type="submit" disabled={isInviting}>
										{isInviting ? "Inviting..." : "Invite"}
									</Button>
								</div>
								{error && <p className="text-sm text-red-500">{error}</p>}
							</div>
						</form>

						<div className="mt-6">
							<h3 className="text-lg font-semibold">Shareable Links</h3>
							<div className="space-y-3 mt-3">
								{shareLinks.map((link) => (
									<div
										key={link.id}
										className="flex items-center justify-between p-2 rounded-md bg-gray-800"
									>
										<div className="flex flex-col">
											<span className="text-sm font-medium text-white">
												Anyone with this link can be a {link.role}
											</span>
											<span className="text-xs text-gray-400 truncate">
												{`${window.location.origin}/join/${link.token}`}
											</span>
										</div>
										<div className="flex items-center gap-1">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleCopy(link.token)}
											>
												{copiedToken === link.token ? (
													<Check className="h-4 w-4 text-green-500" />
												) : (
													<ClipboardCopy className="h-4 w-4" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleRevokeLink(link.id)}
												className="text-gray-500 hover:text-red-500"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
							</div>
							<div className="flex gap-2 mt-4">
								<Select
									value={newLinkRole}
									onValueChange={(value: "EDITOR" | "VIEWER") =>
										setNewLinkRole(value)
									}
								>
									<SelectTrigger className="w-[120px] bg-gray-800 border-gray-700">
										<SelectValue placeholder="Role" />
									</SelectTrigger>
									<SelectContent className="bg-gray-800 text-white">
										<SelectItem value="EDITOR">Editor</SelectItem>
										<SelectItem value="VIEWER">Viewer</SelectItem>
									</SelectContent>
								</Select>
								<Button onClick={handleCreateShareLink}>
									<Plus className="h-4 w-4 mr-2" />
									Create Link
								</Button>
							</div>
						</div>
					</>
				)}

				<DialogFooter>
					<Button onClick={onClose} variant="secondary">
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
