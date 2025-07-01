"use client"

import Link from "next/link"
import {
	Pencil,
	PencilIcon,
	Trash2,
	Trash2Icon,
	MoreHorizontal,
	ImageIcon,
	PlayIcon,
	CalendarIcon,
	Clock,
	ExternalLink,
	FileIcon,
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
import { formatDistanceToNow } from "date-fns"
import { Card, CardContent } from "./ui/card"
import { MoreVertical } from "lucide-react"
import { formatBytes, formatDate } from "@/lib/utils"
import { Button } from "./ui/button"

interface FileCardProps {
	file: File
	projectId: string
	onProjectChanged: () => void
	viewMode?: "grid" | "list"
	onRename?: (file: File) => void
	onDelete?: (file: File) => void
}

export function FileCard({
	file,
	projectId,
	onProjectChanged,
	viewMode = "grid",
	onRename,
	onDelete,
}: FileCardProps) {
	const [isRenameModalOpen, setRenameModalOpen] = useState(false)
	const isVideo = file.name.toLowerCase().endsWith(".mp4")
	const fileCreatedAt = new Date(file.createdAt)
	const formattedDate = formatDistanceToNow(fileCreatedAt, { addSuffix: true })
	const [imageError, setImageError] = useState(false)

	// Get the URL from the latest version or fallback
	const getImageUrl = () => {
		console.log("FileCard: Generating URL for file:", file)

		// Try to get the URL from latestVersion (used in project view)
		if (file.latestVersion?.url) {
			const url = `http://localhost:3001/${file.latestVersion.url}`
			console.log("FileCard: Using latestVersion URL:", url)
			return url
		}
		// Try to get the URL from the first version in the versions array
		if (file.versions && file.versions.length > 0 && file.versions[0]?.url) {
			const url = `http://localhost:3001/${file.versions[0].url}`
			console.log("FileCard: Using versions[0] URL:", url)
			return url
		}
		// Fallback for backward compatibility with legacy images
		if ("url" in file && file.url) {
			const url = `http://localhost:3001/${file.url}`
			console.log("FileCard: Using legacy URL:", url)
			return url
		}
		// No image URL available - return a placeholder image instead of null
		console.log("FileCard: No valid URL found, using placeholder")
		return "/placeholder-image.svg"
	}

	const imageUrl = getImageUrl()
	const placeholderUrl = "/placeholder-image.svg"

	const handleDelete = async () => {
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

	if (viewMode === "list") {
		return (
			<>
				<div className="group flex items-center justify-between rounded-md border border-border/40 bg-card p-3 hover:border-primary/40 transition-all">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted/50">
							{imageUrl ? (
								isVideo ? (
									<div className="relative h-full w-full">
										<img
											src={imageError ? placeholderUrl : imageUrl}
											alt={file.name}
											className="h-full w-full object-cover"
											onError={() => setImageError(true)}
										/>
										<div className="absolute inset-0 flex items-center justify-center bg-black/40">
											<PlayIcon className="h-4 w-4 text-white" />
										</div>
									</div>
								) : (
									<img
										src={imageError ? placeholderUrl : imageUrl}
										alt={file.name}
										className="h-full w-full object-cover"
										onError={() => setImageError(true)}
									/>
								)
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<FileIcon className="h-6 w-6 text-muted-foreground" />
								</div>
							)}
						</div>
						<div className="flex flex-col min-w-0">
							<h3 className="font-medium truncate pr-2" title={file.name}>
								{file.name}
							</h3>
							<div className="flex items-center text-xs text-muted-foreground gap-3">
								<span className="flex items-center gap-1">
									<Clock className="h-3 w-3" />
									{formattedDate}
								</span>
								{file.size && <span>{formatBytes(file.size)}</span>}
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<Button
							asChild
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-muted-foreground hover:text-primary"
						>
							<Link href={`/project/${projectId}/image/${file.id}`}>
								<ExternalLink className="h-4 w-4" />
							</Link>
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-primary"
								>
									<MoreHorizontal className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-52">
								<DropdownMenuItem onClick={() => setRenameModalOpen(true)}>
									<PencilIcon className="mr-2 h-4 w-4 text-primary/70" />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link
										href={`/project/${projectId}/image/${file.id}`}
										className="flex w-full cursor-default items-center"
									>
										<ImageIcon className="mr-2 h-4 w-4 text-primary/70" />
										Open editor
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={handleDelete}
									className="text-destructive"
								>
									<Trash2Icon className="mr-2 h-4 w-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
				<RenameFileModal
					isOpen={isRenameModalOpen}
					onClose={() => setRenameModalOpen(false)}
					file={file}
					onFileRenamed={onProjectChanged}
				/>
			</>
		)
	}

	return (
		<>
			<Card className="group overflow-hidden bg-card hover:shadow-md">
				<Link href={`/project/${projectId}/image/${file.id}`}>
					<div
						className={cn(
							"relative overflow-hidden bg-muted",
							isVideo ? "aspect-video" : "aspect-square"
						)}
					>
						{imageUrl ? (
							isVideo ? (
								<div className="relative h-full w-full">
									<img
										src={imageError ? placeholderUrl : imageUrl}
										alt={file.name}
										className="h-full w-full object-cover"
										onError={() => setImageError(true)}
									/>
									<div className="absolute inset-0 flex items-center justify-center bg-black/40">
										<PlayIcon className="h-8 w-8 text-white" />
									</div>
								</div>
							) : (
								<img
									src={imageError ? placeholderUrl : imageUrl}
									alt={file.name}
									className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
									onError={() => setImageError(true)}
								/>
							)
						) : (
							<div className="flex h-full w-full items-center justify-center">
								<FileIcon className="h-10 w-10 text-muted-foreground" />
							</div>
						)}
					</div>
				</Link>
				<CardContent className="p-4">
					<div className="flex items-center justify-between">
						<div className="truncate">
							<Link href={`/project/${projectId}/image/${file.id}`}>
								<h3 className="truncate font-medium group-hover:text-primary">
									{file.name}
								</h3>
							</Link>
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<span>{formattedDate}</span>
								{file.size && <span>•</span>}
								{file.size && <span>{formatBytes(file.size)}</span>}
							</div>
						</div>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
								>
									<MoreVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => setRenameModalOpen(true)}>
									<PencilIcon className="mr-2 h-4 w-4" />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={handleDelete}
									className="text-destructive focus:text-destructive"
								>
									<Trash2Icon className="mr-2 h-4 w-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</CardContent>
			</Card>
			<RenameFileModal
				isOpen={isRenameModalOpen}
				onClose={() => setRenameModalOpen(false)}
				file={file}
				onFileRenamed={onProjectChanged}
			/>
		</>
	)
}

// Button component for list view
// We're now importing Button from ui components
