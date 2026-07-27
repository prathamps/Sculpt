"use client"

import Link from "next/link"
import {
	PencilIcon,
	Trash2Icon,
	MoreHorizontal,
	ImageIcon,
	PlayIcon,
	Clock,
	ExternalLink,
	FileIcon,
	FileTextIcon,
	BoxIcon,
} from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Image as File, MediaType } from "@/types"
import { useState } from "react"
import { RenameFileModal } from "./RenameFileModal"
import { cn, mediaUrl } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { Card, CardContent } from "./ui/card"
import { MoreVertical } from "lucide-react"
import { formatBytes } from "@/lib/utils"
import { Button } from "./ui/button"
import { ConfirmationModal } from "./ConfirmationModal"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { toast } from "sonner"

interface FileCardProps {
	file: File
	projectId: string
	onProjectChanged: () => void
	viewMode?: "grid" | "list"
	linkTabIndex?: number
	onRename?: (file: File) => void
	onDelete?: (file: File) => void
}

interface ThumbnailProps {
	file: File
	mediaType: MediaType
	iconSize: string
	overlayIconSize: string
	zoomOnHover?: boolean
}

function CardThumbnail({
	file,
	mediaType,
	iconSize,
	overlayIconSize,
	zoomOnHover = false,
}: ThumbnailProps) {
	const [imageError, setImageError] = useState(false)
	const fileUrl =
		file.latestVersion?.url ??
		file.versions?.[0]?.url ??
		(file as unknown as { url?: string }).url
	const thumbnailUrl = file.latestVersion?.thumbnailUrl

	if (!fileUrl) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<FileIcon className={cn(iconSize, "text-muted-foreground")} aria-hidden="true" />
			</div>
		)
	}

	if (mediaType === "VIDEO") {
		return (
			<div className="relative h-full w-full">
				{thumbnailUrl && !imageError ? (
					<img
						src={mediaUrl(thumbnailUrl)}
						alt={file.name}
						className="h-full w-full object-cover"
						onError={() => setImageError(true)}
					/>
				) : (
					<video
						src={mediaUrl(fileUrl)}
						preload="metadata"
						muted
						playsInline
						aria-hidden="true"
						tabIndex={-1}
						className="pointer-events-none h-full w-full object-cover"
					/>
				)}
				<div className="absolute inset-0 flex items-center justify-center bg-black/40">
					<PlayIcon className={cn(overlayIconSize, "text-white")} aria-hidden="true" />
				</div>
			</div>
		)
	}

	if (mediaType === "MODEL") {
		if (thumbnailUrl && !imageError) {
			return (
				<div className="relative h-full w-full">
					<img
						src={mediaUrl(thumbnailUrl)}
						alt={file.name}
						className="h-full w-full object-cover"
						onError={() => setImageError(true)}
					/>
					<span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
						<BoxIcon className="h-3 w-3" aria-hidden="true" />
						3D
					</span>
				</div>
			)
		}
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-1">
				<BoxIcon className={cn(iconSize, "text-muted-foreground")} aria-hidden="true" />
				<span className="text-[10px] font-medium text-muted-foreground">3D</span>
			</div>
		)
	}

	if (mediaType === "PDF") {
		if (thumbnailUrl && !imageError) {
			return (
				<div className="relative h-full w-full">
					<img
						src={mediaUrl(thumbnailUrl)}
						alt={file.name}
						className="h-full w-full object-cover"
						onError={() => setImageError(true)}
					/>
					<span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
						<FileTextIcon className="h-3 w-3" aria-hidden="true" />
						PDF
					</span>
				</div>
			)
		}
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-1">
				<FileTextIcon className={cn(iconSize, "text-muted-foreground")} aria-hidden="true" />
				<span className="text-[10px] font-medium text-muted-foreground">PDF</span>
			</div>
		)
	}

	const previewUrl = thumbnailUrl || file.latestVersion?.proxyUrl || fileUrl

	return (
		<img
			src={imageError ? "/placeholder-image.svg" : mediaUrl(previewUrl)}
			alt={file.name}
			className={cn(
				"h-full w-full object-cover",
				zoomOnHover && "transition-transform duration-200 group-hover:scale-105"
			)}
			onError={() => setImageError(true)}
		/>
	)
}

export function FileCard({
	file,
	projectId,
	onProjectChanged,
	viewMode = "grid",
	linkTabIndex,
}: FileCardProps) {
	const [isRenameModalOpen, setRenameModalOpen] = useState(false)
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const mediaType: MediaType = file.latestVersion?.mediaType ?? "IMAGE"
	const fileCreatedAt = new Date(file.createdAt)
	const formattedDate = formatDistanceToNow(fileCreatedAt, { addSuffix: true })
	const versionCount = file.versionCount ?? 1

	const handleDelete = async () => {
		setIsDeleting(true)
		try {
			await api.delete(`/api/images/${file.id}`)
			toast.success(`Deleted "${file.name}".`)
			setConfirmingDelete(false)
			onProjectChanged()
		} catch (error) {
			toast.error(describeError(error, "Could not delete this file."))
		} finally {
			setIsDeleting(false)
		}
	}

	const deleteConfirmation = (
		<ConfirmationModal
			isOpen={isConfirmingDelete}
			onClose={() => setConfirmingDelete(false)}
			onConfirm={handleDelete}
			title="Delete file"
			description={`Delete "${file.name}"? This removes ${
				versionCount === 1 ? "its version" : `all ${versionCount} versions`
			}, every comment and annotation on it. This cannot be undone.`}
			isConfirming={isDeleting}
		/>
	)

	if (viewMode === "list") {
		return (
			<>
				<div className="group flex items-center justify-between rounded-md border border-border/40 bg-card p-3 hover:border-primary/40 transition-all">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted/50">
							<CardThumbnail
								file={file}
								mediaType={mediaType}
								iconSize="h-6 w-6"
								overlayIconSize="h-4 w-4"
							/>
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
							<Link
								href={`/project/${projectId}/image/${file.id}`}
								aria-label={`Open ${file.name}`}
								tabIndex={linkTabIndex}
							>
								<ExternalLink className="h-4 w-4" aria-hidden="true" />
							</Link>
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-primary"
									aria-label={`Actions for ${file.name}`}
								>
									<MoreHorizontal className="h-4 w-4" aria-hidden="true" />
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
									onClick={() => setConfirmingDelete(true)}
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
				{deleteConfirmation}
			</>
		)
	}

	return (
		<>
			<Card className="group overflow-hidden bg-card hover:shadow-md">
				<Link
					href={`/project/${projectId}/image/${file.id}`}
					tabIndex={linkTabIndex}
				>
					<div className="relative aspect-video overflow-hidden bg-muted">
						<CardThumbnail
							file={file}
							mediaType={mediaType}
							iconSize="h-10 w-10"
							overlayIconSize="h-8 w-8"
							zoomOnHover={mediaType === "IMAGE"}
						/>
					</div>
				</Link>
				<CardContent className="p-4">
					<div className="flex items-center justify-between">
						<div className="truncate">
							<Link
								href={`/project/${projectId}/image/${file.id}`}
								tabIndex={linkTabIndex}
							>
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
									aria-label={`Actions for ${file.name}`}
								>
									<MoreVertical className="h-4 w-4" aria-hidden="true" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => setRenameModalOpen(true)}>
									<PencilIcon className="mr-2 h-4 w-4" />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setConfirmingDelete(true)}
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
			{deleteConfirmation}
		</>
	)
}
