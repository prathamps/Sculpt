"use client"

import { useState } from "react"
import {
	Search,
	Plus,
	MoreHorizontal,
	ChevronDown,
	Users,
	Settings,
	FolderOpen,
	Check,
} from "lucide-react"
import { Input } from "./ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "./ui/dropdown-menu"
import { Project } from "@/types"
import { MembersModal } from "./MembersModal"
import { ProjectSettingsModal } from "./ProjectSettingsModal"
import { ConfirmationModal } from "./ConfirmationModal"
import { cn } from "@/lib/utils"

interface ProjectSidebarProps {
	projects: Project[]
	selectedProject: Project | null
	onSelectProject: (project: Project) => void
	onCreateNew: () => void
	isSidebarOpen: boolean
	onProjectChanged: () => void
}

export function ProjectSidebar({
	projects,
	selectedProject,
	onSelectProject,
	onCreateNew,
	isSidebarOpen,
	onProjectChanged,
}: ProjectSidebarProps) {
	const [isMembersModalOpen, setMembersModalOpen] = useState(false)
	const [isSettingsModalOpen, setSettingsModalOpen] = useState(false)
	const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	const filteredProjects = projects.filter((project) =>
		project.name.toLowerCase().includes(searchQuery.toLowerCase())
	)

	const handleDeleteProject = async (projectId: string) => {
		setIsDeleting(true)
		try {
			const res = await fetch(`${URI}/api/projects/${projectId}`, {
				method: "DELETE",
				credentials: "include",
			})

			if (res.ok) {
				onProjectChanged()
			} else {
				console.error("Failed to delete project")
				alert("Failed to delete project.")
			}
		} catch (error) {
			console.error("Error deleting project:", error)
			alert("An error occurred while deleting the project.")
		} finally {
			setIsDeleting(false)
			setDeleteConfirmOpen(false)
		}
	}

	return (
		<>
			<aside
				className={cn(
					"absolute z-20 h-[calc(100vh-3.5rem)] w-72 flex-col border-r border-border/40 bg-card p-4 transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
					isSidebarOpen ? "translate-x-0" : "-translate-x-full"
				)}
			>
				{/* Workspace Switcher */}
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
							<FolderOpen className="h-4 w-4" />
						</div>
						<span className="text-sm font-medium">My Workspace</span>
					</div>
					<ChevronDown className="h-4 w-4 text-muted-foreground" />
				</div>

				{/* Search */}
				<div className="relative mb-5">
					<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Search projects..."
						className="w-full rounded-md border-border/40 bg-muted pl-8 text-sm"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>

				{/* Projects heading */}
				<div className="flex items-center justify-between">
					<h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Projects
					</h2>
					<button
						onClick={onCreateNew}
						className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-secondary text-muted-foreground"
						title="Create new project"
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
				</div>

				{/* Project list */}
				<nav className="mt-2 -mx-2 flex-1 space-y-px overflow-y-auto">
					{filteredProjects.length === 0 && (
						<div className="px-2 py-3 text-center text-xs text-muted-foreground">
							{searchQuery ? "No matching projects found" : "No projects yet"}
						</div>
					)}

					{filteredProjects.map((project) => (
						<div
							key={project.id}
							className={cn(
								"group flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
								selectedProject?.id === project.id
									? "bg-accent text-accent-foreground"
									: "text-foreground hover:bg-secondary"
							)}
						>
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault()
									onSelectProject(project)
								}}
								className="flex flex-1 items-center gap-2 truncate"
							>
								{selectedProject?.id === project.id && (
									<Check className="h-3.5 w-3.5 text-sidebar-primary flex-shrink-0" />
								)}
								<span
									className={cn(
										"truncate",
										selectedProject?.id === project.id ? "font-medium" : ""
									)}
								>
									{project.name}
								</span>
							</a>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button className="invisible flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary group-hover:visible">
										<MoreHorizontal className="h-4 w-4" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-52">
									<DropdownMenuItem onClick={() => setSettingsModalOpen(true)}>
										<Settings className="mr-2 h-4 w-4" />
										Project settings
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => setMembersModalOpen(true)}>
										<Users className="mr-2 h-4 w-4" />
										Manage members
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="text-destructive"
										onClick={() => setDeleteConfirmOpen(true)}
									>
										Delete project
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					))}
				</nav>

				{/* User/Account section at bottom */}
				<div className="mt-auto pt-4 border-t border-border/40">
					<div className="flex items-center justify-between rounded-md p-2 text-xs text-muted-foreground">
						<div>Free Plan</div>
						<a href="#" className="text-sidebar-primary hover:underline">
							Upgrade
						</a>
					</div>
				</div>
			</aside>

			{/* Modals */}
			<MembersModal
				isOpen={isMembersModalOpen}
				onClose={() => setMembersModalOpen(false)}
				project={selectedProject}
				onMembersChanged={onProjectChanged}
			/>
			<ProjectSettingsModal
				isOpen={isSettingsModalOpen}
				onClose={() => setSettingsModalOpen(false)}
				project={selectedProject}
				onProjectChanged={onProjectChanged}
			/>
			{selectedProject && (
				<ConfirmationModal
					isOpen={isDeleteConfirmOpen}
					onClose={() => setDeleteConfirmOpen(false)}
					onConfirm={() => handleDeleteProject(selectedProject.id)}
					title="Delete project"
					description={`This will permanently delete the project "${selectedProject.name}" and all its data. This action cannot be undone.`}
					isConfirming={isDeleting}
				/>
			)}
		</>
	)
}
