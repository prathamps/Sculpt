"use client"

import { useState } from "react"
import {
	ChevronRight,
	FolderIcon,
	FolderPlus,
	MoreHorizontal,
	PencilIcon,
	Trash2Icon,
} from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { ConfirmationModal } from "./ConfirmationModal"
import { FolderNode, folderTrail } from "@/hooks/useProjectFolders"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { toast } from "sonner"

interface FolderBrowserProps {
	projectId: string
	folders: FolderNode[]
	currentFolderId: string | null
	onNavigate: (folderId: string | null) => void
	onFoldersChanged: () => void
	canEdit: boolean
}

export function FolderBrowser({
	projectId,
	folders,
	currentFolderId,
	onNavigate,
	onFoldersChanged,
	canEdit,
}: FolderBrowserProps) {
	const [isCreating, setIsCreating] = useState(false)
	const [newName, setNewName] = useState("")
	const [renaming, setRenaming] = useState<FolderNode | null>(null)
	const [renameValue, setRenameValue] = useState("")
	const [deleting, setDeleting] = useState<FolderNode | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	const trail = folderTrail(folders, currentFolderId)
	const childFolders = folders.filter(
		(folder) => folder.parentId === currentFolderId
	)

	const createFolder = async () => {
		const name = newName.trim()
		if (!name) return
		try {
			await api.post(`/api/projects/${projectId}/folders`, {
				name,
				parentId: currentFolderId,
			})
			setNewName("")
			setIsCreating(false)
			onFoldersChanged()
		} catch (error) {
			toast.error(describeError(error, "Could not create the folder."))
		}
	}

	const submitRename = async () => {
		const name = renameValue.trim()
		if (!renaming || !name) return
		try {
			await api.patch(`/api/projects/${projectId}/folders/${renaming.id}`, {
				name,
			})
			setRenaming(null)
			onFoldersChanged()
		} catch (error) {
			toast.error(describeError(error, "Could not rename the folder."))
		}
	}

	const confirmDelete = async () => {
		if (!deleting) return
		setIsDeleting(true)
		try {
			await api.delete(`/api/projects/${projectId}/folders/${deleting.id}`)
			if (currentFolderId === deleting.id) onNavigate(deleting.parentId)
			setDeleting(null)
			onFoldersChanged()
		} catch (error) {
			toast.error(describeError(error, "Could not delete the folder."))
		} finally {
			setIsDeleting(false)
		}
	}

	return (
		<div className="mb-4 space-y-3">
			<div className="flex flex-wrap items-center gap-1 text-sm">
				<nav aria-label="Folder breadcrumb" className="flex flex-wrap items-center gap-1">
					<button
						className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => onNavigate(null)}
					>
						All files
					</button>
					{trail.map((folder, index) => (
						<span key={folder.id} className="flex items-center gap-1">
							<ChevronRight
								className="h-3.5 w-3.5 text-muted-foreground"
								aria-hidden="true"
							/>
							<button
								className="rounded px-1.5 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => onNavigate(folder.id)}
								aria-current={index === trail.length - 1 ? "page" : undefined}
							>
								{folder.name}
							</button>
						</span>
					))}
				</nav>
				{canEdit && !isCreating && (
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto h-7 gap-1 text-xs"
						onClick={() => setIsCreating(true)}
					>
						<FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
						New folder
					</Button>
				)}
			</div>

			{isCreating && (
				<div className="flex items-center gap-2">
					<Input
						autoFocus
						value={newName}
						aria-label="New folder name"
						placeholder="Folder name"
						className="h-8 max-w-xs"
						onChange={(e) => setNewName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void createFolder()
							if (e.key === "Escape") setIsCreating(false)
						}}
					/>
					<Button size="sm" className="h-8" onClick={createFolder}>
						Create
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-8"
						onClick={() => {
							setIsCreating(false)
							setNewName("")
						}}
					>
						Cancel
					</Button>
				</div>
			)}

			{childFolders.length > 0 && (
				<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
					{childFolders.map((folder) => (
						<li key={folder.id}>
							<div className="group flex items-center gap-2 rounded-md border border-border/40 bg-card p-2.5 transition-colors hover:border-primary/40">
								{renaming?.id === folder.id ? (
									<Input
										autoFocus
										value={renameValue}
										aria-label={`Rename ${folder.name}`}
										className="h-7"
										onChange={(e) => setRenameValue(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") void submitRename()
											if (e.key === "Escape") setRenaming(null)
										}}
										onBlur={submitRename}
									/>
								) : (
									<>
										<button
											className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											onClick={() => onNavigate(folder.id)}
										>
											<FolderIcon
												className="h-4 w-4 shrink-0 text-primary"
												aria-hidden="true"
											/>
											<span className="truncate text-sm font-medium">
												{folder.name}
											</span>
											<span className="ml-auto shrink-0 text-xs text-muted-foreground">
												{folder.imageCount}
											</span>
										</button>
										{canEdit && (
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6 text-muted-foreground"
														aria-label={`Actions for ${folder.name}`}
													>
														<MoreHorizontal
															className="h-3.5 w-3.5"
															aria-hidden="true"
														/>
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() => {
															setRenaming(folder)
															setRenameValue(folder.name)
														}}
													>
														<PencilIcon className="mr-2 h-3.5 w-3.5" />
														Rename
													</DropdownMenuItem>
													<DropdownMenuItem
														className="text-destructive focus:text-destructive"
														onClick={() => setDeleting(folder)}
													>
														<Trash2Icon className="mr-2 h-3.5 w-3.5" />
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</>
								)}
							</div>
						</li>
					))}
				</ul>
			)}

			<ConfirmationModal
				isOpen={!!deleting}
				onClose={() => setDeleting(null)}
				onConfirm={confirmDelete}
				title="Delete folder"
				description={`Delete "${deleting?.name}"? Sub-folders are deleted too. Files inside move back to All files rather than being deleted.`}
				isConfirming={isDeleting}
			/>
		</div>
	)
}
