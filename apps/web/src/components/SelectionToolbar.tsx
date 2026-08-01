"use client"

import { useState } from "react"
import { FolderInputIcon, Trash2Icon, X } from "lucide-react"
import { Button } from "./ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { ConfirmationModal } from "./ConfirmationModal"
import { FolderNode } from "@/hooks/useProjectFolders"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { toast } from "sonner"

interface SelectionToolbarProps {
	projectId: string
	selectedIds: string[]
	folders: FolderNode[]
	currentFolderId: string | null
	onClear: () => void
	onChanged: () => void
}

export function SelectionToolbar({
	projectId,
	selectedIds,
	folders,
	currentFolderId,
	onClear,
	onChanged,
}: SelectionToolbarProps) {
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const [isWorking, setIsWorking] = useState(false)

	const count = selectedIds.length
	const label = `${count} file${count === 1 ? "" : "s"}`

	const moveSelected = async (folderId: string | null) => {
		setIsWorking(true)
		try {
			await api.patch(`/api/projects/${projectId}/images/folder`, {
				imageIds: selectedIds,
				folderId,
			})
			toast.success(`Moved ${label}.`)
			onClear()
			onChanged()
		} catch (error) {
			toast.error(describeError(error, "Could not move the selected files."))
		} finally {
			setIsWorking(false)
		}
	}

	const deleteSelected = async () => {
		setIsWorking(true)
		try {
			await api.post(`/api/projects/${projectId}/images/delete`, {
				imageIds: selectedIds,
			})
			toast.success(`Deleted ${label}.`)
			setConfirmingDelete(false)
			onClear()
			onChanged()
		} catch (error) {
			toast.error(describeError(error, "Could not delete the selected files."))
		} finally {
			setIsWorking(false)
		}
	}

	return (
		<>
			<div
				role="region"
				aria-label={`${label} selected`}
				className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
			>
				<span className="text-sm font-medium">{label} selected</span>
				<div className="ml-auto flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 text-xs"
								disabled={isWorking}
							>
								<FolderInputIcon className="h-3.5 w-3.5" aria-hidden="true" />
								Move to
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
							<DropdownMenuItem
								disabled={currentFolderId === null}
								onClick={() => moveSelected(null)}
							>
								All files
							</DropdownMenuItem>
							{folders.map((folder) => (
								<DropdownMenuItem
									key={folder.id}
									disabled={folder.id === currentFolderId}
									onClick={() => moveSelected(folder.id)}
								>
									{folder.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
						onClick={() => setConfirmingDelete(true)}
						disabled={isWorking}
					>
						<Trash2Icon className="h-3.5 w-3.5" aria-hidden="true" />
						Delete
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={onClear}
						aria-label="Clear selection"
					>
						<X className="h-3.5 w-3.5" aria-hidden="true" />
					</Button>
				</div>
			</div>

			<ConfirmationModal
				isOpen={isConfirmingDelete}
				onClose={() => setConfirmingDelete(false)}
				onConfirm={deleteSelected}
				title={`Delete ${label}`}
				description={`Delete ${label}? Every version, comment and annotation on them goes too. This cannot be undone.`}
				isConfirming={isWorking}
			/>
		</>
	)
}
