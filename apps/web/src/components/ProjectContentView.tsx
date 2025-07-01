"use client"

import { Button } from "./ui/button"
import { FileCard } from "./FileCard"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Project } from "@/types"
import {
	PlusIcon,
	FolderIcon,
	Users,
	Grid2X2,
	ListIcon,
	SlidersHorizontal,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface ProjectContentViewProps {
	project: Project | null
	onUploadClick: () => void
	onProjectChanged: () => void
}

export function ProjectContentView({
	project,
	onUploadClick,
	onProjectChanged,
}: ProjectContentViewProps) {
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

	if (!project) {
		return (
			<div className="flex flex-1 items-center justify-center p-8">
				<div className="flex w-full max-w-md flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
					<FolderIcon className="h-12 w-12 text-muted-foreground/50" />
					<h2 className="mt-4 text-xl font-medium">No project selected</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Select a project from the sidebar or create a new one.
					</p>
				</div>
			</div>
		)
	}

	return (
		<main className="flex-1 overflow-y-auto p-5 md:p-6">
			{/* Project Header */}
			<div className="mb-6 flex flex-col gap-4 border-b border-border/30 pb-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-xl font-semibold text-foreground md:text-2xl">
						{project.name}
					</h1>
					<div className="mt-1 flex items-center">
						<div className="flex -space-x-2 overflow-hidden">
							{project.members.slice(0, 5).map((member) => (
								<Avatar
									key={member.user.id}
									className="h-6 w-6 border-2 border-background"
								>
									<AvatarImage
										src={`https://api.dicebear.com/7.x/micah/svg?seed=${member.user.email}`}
										alt={member.user.name ?? member.user.email}
									/>
									<AvatarFallback className="text-xs">
										{member.user.name?.charAt(0).toUpperCase() ??
											member.user.email.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							))}
							{project.members.length > 5 && (
								<div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-xs">
									+{project.members.length - 5}
								</div>
							)}
						</div>
						<span className="ml-2 text-xs text-muted-foreground">
							{project.members.length} member
							{project.members.length !== 1 && "s"}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex items-center rounded-md border border-border/40 bg-background p-0.5">
						<button
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded",
								viewMode === "grid"
									? "bg-card text-foreground"
									: "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setViewMode("grid")}
							title="Grid view"
						>
							<Grid2X2 className="h-4 w-4" />
						</button>
						<button
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded",
								viewMode === "list"
									? "bg-card text-foreground"
									: "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setViewMode("list")}
							title="List view"
						>
							<ListIcon className="h-4 w-4" />
						</button>
					</div>
					<Button variant="outline" size="sm" className="h-7 gap-1">
						<SlidersHorizontal className="h-3.5 w-3.5" />
						<span className="text-xs">Filter</span>
					</Button>
					<Button size="sm" className="h-7 gap-1" onClick={onUploadClick}>
						<PlusIcon className="h-3.5 w-3.5" />
						<span className="text-xs">Upload</span>
					</Button>
				</div>
			</div>

			{/* Files Section */}
			<div className="flex items-center justify-between pb-4">
				<h3 className="text-sm font-medium">
					{project.images.length} file{project.images.length !== 1 && "s"}
				</h3>
			</div>

			{project.images.length > 0 ? (
				<div
					className={cn(
						"grid gap-4",
						viewMode === "grid"
							? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
							: "grid-cols-1"
					)}
				>
					{project.images.map((image) => (
						<FileCard
							key={image.id}
							file={image}
							projectId={project.id}
							onProjectChanged={onProjectChanged}
						/>
					))}
				</div>
			) : (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
						<PlusIcon className="h-6 w-6" />
					</div>
					<h2 className="mt-4 text-lg font-medium">No files yet</h2>
					<p className="mt-2 max-w-md text-sm text-muted-foreground">
						Upload your first file to start working on this project.
					</p>
					<Button onClick={onUploadClick} className="mt-6">
						<PlusIcon className="mr-2 h-4 w-4" />
						Upload File
					</Button>
				</div>
			)}
		</main>
	)
}
