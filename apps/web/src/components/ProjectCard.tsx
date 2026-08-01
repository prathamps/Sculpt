"use client"

import Link from "next/link"
import {
	Pencil,
	Trash2,
	ExternalLink,
	MoreHorizontal,
	
	ChevronRight,
} from "lucide-react"
import { Project } from "@/types"
import { mediaUrl } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { useState } from "react"
import { UserAvatar } from "@/components/UserAvatar"

interface ProjectCardProps {
	project: Project
	onEdit: (project: Project) => void
	onDelete: (project: Project) => void
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
	const firstImage = project.images?.[0]
	const createdDate = new Date(project.createdAt).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	})
	const getImageUrl = () => {
		if (!firstImage) return null
		const url =
			firstImage.latestVersion?.url ??
			firstImage.versions?.[0]?.url ??
			(firstImage as unknown as { url?: string }).url
		return url ? mediaUrl(url) : "/placeholder-image.svg"
	}

	const imageUrl = getImageUrl()
	const [imageError, setImageError] = useState(false)
	const placeholderUrl = "/placeholder-image.svg"

	return (
		<div className="group relative overflow-hidden rounded-lg border border-border/50 bg-card transition-all hover:border-border">
			<Link href={`/project/${project.id}`} className="block">
				<div className="relative aspect-video overflow-hidden rounded-t-lg bg-muted/50">
					{imageUrl ? (
						<img
							src={imageError ? placeholderUrl : imageUrl}
							alt={project.name}
							className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
							onError={() => setImageError(true)}
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<img
								src={placeholderUrl}
								alt="No image available"
								className="h-full w-full object-cover"
							/>
						</div>
					)}
				</div>

				<div className="p-4">
					<div className="flex items-start justify-between">
						<div>
							<h3 className="font-medium line-clamp-1">{project.name}</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								{project.images.length}{" "}
								{project.images.length === 1 ? "file" : "files"} · {createdDate}
							</p>
						</div>
					</div>

					<div className="mt-3 flex items-center justify-between">
						<div className="flex -space-x-2">
							{project.members.slice(0, 3).map((member) => (
								<UserAvatar
									key={member.user.id}
									className="h-6 w-6 border-2 border-card"
									fallbackClassName="text-xs"
									name={member.user.name}
									email={member.user.email}
									avatarUrl={member.user.avatarUrl}
								/>
							))}
							{project.members.length > 3 && (
								<div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-xs">
									+{project.members.length - 3}
								</div>
							)}
						</div>

						<span className="text-xs text-primary/80 flex items-center">
							View
							<ChevronRight className="ml-0.5 h-3 w-3" />
						</span>
					</div>
				</div>
			</Link>

			<div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							className="flex h-8 w-8 items-center justify-center rounded-md bg-background/80 text-foreground/80 backdrop-blur-sm hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label={`Actions for ${project.name}`}
						>
							<MoreHorizontal className="h-4 w-4" aria-hidden="true" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<DropdownMenuItem
							onClick={(e) => {
								e.preventDefault()
								onEdit(project)
							}}
						>
							<Pencil className="mr-2 h-4 w-4" />
							Edit project
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link
								href={`/project/${project.id}`}
								target="_blank"
								className="flex w-full cursor-default items-center"
							>
								<ExternalLink className="mr-2 h-4 w-4" />
								Open in new tab
							</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={(e) => {
								e.preventDefault()
								onDelete(project)
							}}
							className="text-destructive"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete project
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	)
}
