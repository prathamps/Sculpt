"use client"

import Image from "next/image"
import Link from "next/link"
import {
	Pencil,
	Trash2,
	MoreHorizontal,
	ImageIcon,
	PlayIcon,
	CalendarIcon,
} from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Image as File } from "@/types"
import { useState } from "react"
import { RenameFileModal } from "./RenameFileModal"
import { cn } from "@/lib/utils"

interface FileCardProps {
	file: File
	projectId: string
	onProjectChanged: () => void
}

export function FileCard({ file, projectId, onProjectChanged }: FileCardProps) {
	const [isRenameModalOpen, setRenameModalOpen] = useState(false)
	const isVideo = file.name.toLowerCase().endsWith(".mp4")

	const handleDelete = async () => {
		if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return

		try {
			const res = await fetch(`http://localhost:3001/api/images/${file.id}`, {
				method: "DELETE",
				credentials: "include",
			})
			if (res.ok) {
				onProjectChanged()
			} else {
				alert("Failed to delete file.")
			}
		} catch (error) {
			alert("An error occurred while deleting the file.")
		}
	}

	return (
		<>
			<div className="group relative flex flex-col overflow-hidden rounded-lg border border-border/40 bg-card transition-all hover:border-border">
				<Link
					href={`/project/${projectId}/image/${file.id}`}
					className="relative aspect-video overflow-hidden"
				>
					{isVideo ? (
						<div className="relative h-full w-full">
							<Image
								src={`http://localhost:3001/${file.url}`}
								alt={file.name}
								fill
								className="object-cover"
							/>
							<div className="absolute inset-0 flex items-center justify-center bg-black/40">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
									<PlayIcon className="h-6 w-6 text-white" />
								</div>
							</div>
						</div>
					) : (
						<Image
							src={`http://localhost:3001/${file.url}`}
							alt={file.name}
							fill
							className="object-cover"
						/>
					)}
				</Link>

				<div className="flex flex-col p-3">
					<div className="flex items-start justify-between">
						<h3
							className="max-w-[calc(100%-28px)] truncate font-medium"
							title={file.name}
						>
							{file.name}
						</h3>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
									<MoreHorizontal className="h-4 w-4" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-52">
								<DropdownMenuItem onClick={() => setRenameModalOpen(true)}>
									<Pencil className="mr-2 h-4 w-4" />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link
										href={`/project/${projectId}/image/${file.id}`}
										className="flex w-full cursor-default items-center"
									>
										<ImageIcon className="mr-2 h-4 w-4" />
										Open editor
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={handleDelete}
									className="text-destructive"
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<div className="mt-1.5 flex items-center text-xs text-muted-foreground">
						<CalendarIcon className="mr-1 h-3 w-3" />
						<span>Added today</span>
					</div>
				</div>
			</div>
			<RenameFileModal
				isOpen={isRenameModalOpen}
				onClose={() => setRenameModalOpen(false)}
				file={file}
				onFileRenamed={() => {
					onProjectChanged()
					setRenameModalOpen(false)
				}}
			/>
		</>
	)
}
