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
	Check,
	FileImageIcon,
	VideoIcon,
	ClockIcon,
	CalendarIcon,
	X,
	Search,
} from "lucide-react"
import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuCheckboxItem,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Input } from "./ui/input"

interface ProjectContentViewProps {
	project: Project | null
	onUploadClick: () => void
	onProjectChanged: () => void
}

type FileType = "image" | "video" | "all"
type SortOption = "newest" | "oldest" | "a-z" | "z-a"

export function ProjectContentView({
	project,
	onUploadClick,
	onProjectChanged,
}: ProjectContentViewProps) {
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
	const [fileType, setFileType] = useState<FileType>("all")
	const [sortBy, setSortBy] = useState<SortOption>("newest")
	const [searchQuery, setSearchQuery] = useState("")
	const [showFilterBar, setShowFilterBar] = useState(false)

	// Filter and sort files
	const filteredAndSortedFiles = useMemo(() => {
		if (!project) return []

		// First filter by type
		let filtered = project.images.filter((file) => {
			// Filter by search query
			if (
				searchQuery &&
				!file.name.toLowerCase().includes(searchQuery.toLowerCase())
			) {
				return false
			}

			// Filter by file type
			if (fileType === "all") return true

			// Get the file extension from the name or latestVersion
			const fileUrl =
				file.latestVersion?.url ||
				(file.versions && file.versions.length > 0 && file.versions[0]?.url
					? file.versions[0].url
					: "")
			const isVideoFile =
				fileUrl.toLowerCase().endsWith(".mp4") ||
				file.name.toLowerCase().endsWith(".mp4")

			if (fileType === "image") return !isVideoFile
			if (fileType === "video") return isVideoFile

			return true
		})

		// Then sort
		return filtered.sort((a, b) => {
			switch (sortBy) {
				case "newest":
					return (
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
					)
				case "oldest":
					return (
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
					)
				case "a-z":
					return a.name.localeCompare(b.name)
				case "z-a":
					return b.name.localeCompare(a.name)
				default:
					return 0
			}
		})
	}, [project, fileType, sortBy, searchQuery])

	const fileTypeCount = useMemo(() => {
		if (!project) return { total: 0, images: 0, videos: 0 }

		const images = project.images.filter((file) => {
			const fileUrl =
				file.latestVersion?.url ||
				(file.versions && file.versions.length > 0 && file.versions[0]?.url
					? file.versions[0].url
					: "")
			return (
				!fileUrl.toLowerCase().endsWith(".mp4") &&
				!file.name.toLowerCase().endsWith(".mp4")
			)
		}).length

		const videos = project.images.filter((file) => {
			const fileUrl =
				file.latestVersion?.url ||
				(file.versions && file.versions.length > 0 && file.versions[0]?.url
					? file.versions[0].url
					: "")
			return (
				fileUrl.toLowerCase().endsWith(".mp4") ||
				file.name.toLowerCase().endsWith(".mp4")
			)
		}).length

		return {
			total: project.images.length,
			images,
			videos,
		}
	}, [project])

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
					<Button
						variant={showFilterBar ? "default" : "outline"}
						size="sm"
						className={cn(
							"h-7 gap-1",
							showFilterBar &&
								"bg-primary text-primary-foreground hover:bg-primary/90"
						)}
						onClick={() => setShowFilterBar(!showFilterBar)}
					>
						<SlidersHorizontal className="h-3.5 w-3.5" />
						<span className="text-xs">Filter</span>
					</Button>
					<Button
						size="sm"
						className="h-7 gap-1 bg-primary hover:bg-primary/90 text-primary-foreground"
						onClick={onUploadClick}
					>
						<PlusIcon className="h-3.5 w-3.5" />
						<span className="text-xs">Upload</span>
					</Button>
				</div>
			</div>

			{/* Filter Bar */}
			{showFilterBar && (
				<div className="mb-4 rounded-md border border-border/50 bg-card/50 p-3">
					<div className="flex flex-wrap items-center gap-3">
						<div className="relative flex-1 min-w-[200px]">
							<Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search files..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-8 h-8 bg-background/70"
							/>
							{searchQuery && (
								<Button
									variant="ghost"
									size="icon"
									className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-primary"
									onClick={() => setSearchQuery("")}
								>
									<X className="h-3.5 w-3.5" />
								</Button>
							)}
						</div>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 px-3 hover:text-primary"
								>
									<FileImageIcon className="h-3.5 w-3.5" />
									<span className="text-xs">
										{fileType === "all"
											? "All files"
											: fileType === "image"
											? "Images only"
											: "Videos only"}
									</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-40">
								<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
									File Type
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuCheckboxItem
									checked={fileType === "all"}
									onCheckedChange={() => setFileType("all")}
									className="text-xs"
								>
									All files ({fileTypeCount.total})
								</DropdownMenuCheckboxItem>
								<DropdownMenuCheckboxItem
									checked={fileType === "image"}
									onCheckedChange={() => setFileType("image")}
									className="text-xs"
								>
									Images only ({fileTypeCount.images})
								</DropdownMenuCheckboxItem>
								<DropdownMenuCheckboxItem
									checked={fileType === "video"}
									onCheckedChange={() => setFileType("video")}
									className="text-xs"
								>
									Videos only ({fileTypeCount.videos})
								</DropdownMenuCheckboxItem>
							</DropdownMenuContent>
						</DropdownMenu>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 px-3 hover:text-primary"
								>
									<ClockIcon className="h-3.5 w-3.5" />
									<span className="text-xs">
										{sortBy === "newest"
											? "Newest first"
											: sortBy === "oldest"
											? "Oldest first"
											: sortBy === "a-z"
											? "A to Z"
											: "Z to A"}
									</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-40">
								<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
									Sort By
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuCheckboxItem
									checked={sortBy === "newest"}
									onCheckedChange={() => setSortBy("newest")}
									className="text-xs"
								>
									Newest first
								</DropdownMenuCheckboxItem>
								<DropdownMenuCheckboxItem
									checked={sortBy === "oldest"}
									onCheckedChange={() => setSortBy("oldest")}
									className="text-xs"
								>
									Oldest first
								</DropdownMenuCheckboxItem>
								<DropdownMenuSeparator />
								<DropdownMenuCheckboxItem
									checked={sortBy === "a-z"}
									onCheckedChange={() => setSortBy("a-z")}
									className="text-xs"
								>
									Name (A to Z)
								</DropdownMenuCheckboxItem>
								<DropdownMenuCheckboxItem
									checked={sortBy === "z-a"}
									onCheckedChange={() => setSortBy("z-a")}
									className="text-xs"
								>
									Name (Z to A)
								</DropdownMenuCheckboxItem>
							</DropdownMenuContent>
						</DropdownMenu>

						{(searchQuery || fileType !== "all" || sortBy !== "newest") && (
							<Button
								variant="ghost"
								size="sm"
								className="h-8 text-xs text-muted-foreground hover:text-primary"
								onClick={() => {
									setSearchQuery("")
									setFileType("all")
									setSortBy("newest")
								}}
							>
								Reset filters
							</Button>
						)}
					</div>
				</div>
			)}

			{/* Files Section */}
			<div className="flex items-center justify-between pb-4">
				<h3 className="text-sm font-medium">
					{filteredAndSortedFiles.length} file
					{filteredAndSortedFiles.length !== 1 && "s"}
					{project.images.length !== filteredAndSortedFiles.length &&
						` (filtered from ${project.images.length})`}
				</h3>
			</div>

			{project.images.length > 0 ? (
				<>
					{filteredAndSortedFiles.length > 0 ? (
						<div
							className={cn(
								"grid gap-4",
								viewMode === "grid"
									? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
									: "grid-cols-1"
							)}
						>
							{filteredAndSortedFiles.map((image) => (
								<FileCard
									key={image.id}
									file={image}
									projectId={project.id}
									onProjectChanged={onProjectChanged}
									viewMode={viewMode}
								/>
							))}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
								<Search className="h-6 w-6 text-muted-foreground" />
							</div>
							<h2 className="mt-4 text-lg font-medium">
								No files match your filters
							</h2>
							<p className="mt-2 max-w-md text-sm text-muted-foreground">
								Try adjusting your search or filter criteria to find what you're
								looking for.
							</p>
							<Button
								variant="outline"
								onClick={() => {
									setSearchQuery("")
									setFileType("all")
									setSortBy("newest")
								}}
								className="mt-6 hover:text-primary hover:border-primary"
							>
								Clear all filters
							</Button>
						</div>
					)}
				</>
			) : (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
						<PlusIcon className="h-6 w-6" />
					</div>
					<h2 className="mt-4 text-lg font-medium">No files yet</h2>
					<p className="mt-2 max-w-md text-sm text-muted-foreground">
						Upload your first file to start working on this project.
					</p>
					<Button
						onClick={onUploadClick}
						className="mt-6 bg-primary hover:bg-primary/90 text-primary-foreground"
					>
						<PlusIcon className="mr-2 h-4 w-4" />
						Upload File
					</Button>
				</div>
			)}
		</main>
	)
}
