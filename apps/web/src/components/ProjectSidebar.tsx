"use client"

import { Search, Plus, MoreHorizontal, ChevronDown, Users } from "lucide-react"
import { Input } from "./ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"

// Using the same Project interface from dashboard
interface Project {
	id: string
	name: string
	images: { id: string; url: string; name: string }[]
}

interface ProjectSidebarProps {
	projects: Project[]
	selectedProject: Project | null
	onSelectProject: (project: Project) => void
	onCreateNew: () => void
	isSidebarOpen: boolean
}

export function ProjectSidebar({
	projects,
	selectedProject,
	onSelectProject,
	onCreateNew,
	isSidebarOpen,
}: ProjectSidebarProps) {
	return (
		<aside
			className={`absolute z-20 h-full w-72 flex-col border-r border-gray-800 bg-[#171717] p-4 transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
				isSidebarOpen ? "translate-x-0" : "-translate-x-full"
			}`}
		>
			{/* Workspace Switcher */}
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="h-8 w-8 rounded-md bg-blue-500" />
					<span className="font-semibold">My Workspace</span>
				</div>
				<ChevronDown className="h-4 w-4 text-gray-400" />
			</div>

			{/* Search and Project List */}
			<div className="relative mb-4">
				<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
				<Input
					type="search"
					placeholder="Search..."
					className="w-full rounded-lg bg-gray-800 pl-8"
				/>
			</div>
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-gray-400">My Projects</h2>
				<button
					onClick={onCreateNew}
					className="text-gray-400 hover:text-white"
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>
			<nav className="mt-2 flex-1 space-y-1 overflow-y-auto">
				{projects.map((project) => (
					<div
						key={project.id}
						className={`flex items-center justify-between rounded-md text-sm font-medium ${
							selectedProject?.id === project.id
								? "bg-gray-800 text-white"
								: "text-gray-300 hover:bg-gray-800/50"
						}`}
					>
						<a
							href="#"
							onClick={(e) => {
								e.preventDefault()
								onSelectProject(project)
							}}
							className="flex-1 truncate px-3 py-2"
						>
							{project.name}
						</a>
						{selectedProject?.id === project.id && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button className="p-2 text-gray-400 hover:text-white">
										<MoreHorizontal className="h-4 w-4" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									<DropdownMenuItem>Invite people</DropdownMenuItem>
									<DropdownMenuItem>Project settings</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				))}
			</nav>

			{/* Footer section of sidebar can be removed or repurposed */}
			{/* <div className="mt-auto">
				<button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800/50">
					<Users className="h-4 w-4" />
					<span>Invite people</span>
				</button>
			</div> */}
		</aside>
	)
}
