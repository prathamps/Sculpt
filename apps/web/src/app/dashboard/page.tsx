"use client"

import { useAuth } from "@/context/AuthContext"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreateProjectModal } from "@/components/CreateProjectModal"
import { ImageUploadModal } from "@/components/ImageUploadModal"
import {
	User,
	LogOut,
	LayoutGrid,
	PanelLeft,
	FilePen,
	Trash2,
} from "lucide-react"
import { ProjectCard } from "@/components/ProjectCard"
import { ProjectSidebar } from "@/components/ProjectSidebar"
import { ProjectContentView } from "@/components/ProjectContentView"
import { Header } from "@/components/Header"

interface Project {
	id: string
	name: string
	images: { id: string; url: string; name: string }[]
}

interface File {
	id: string
	url: string
	name: string
}

interface Image {
	id: string
	url: string
	name: string
}

const ImageCard = ({ image }: { image: Image }) => (
	<div className="bg-[#1e1e1e] rounded-lg overflow-hidden transform hover:scale-105 transition-transform">
		<Link href={`/projects/${image.id}`}>
			<Image
				src={`http://localhost:3001/${image.url}`}
				alt={image.name}
				width={300}
				height={200}
				className="w-full h-48 object-cover"
			/>
		</Link>
		<div className="p-4">
			<h3 className="text-lg font-bold truncate">{image.name}</h3>
			<div className="flex justify-end space-x-2 mt-2">
				<button className="p-1 hover:bg-gray-700 rounded-full">
					<FilePen className="h-4 w-4" />
				</button>
				<button className="p-1 hover:bg-gray-700 rounded-full">
					<Trash2 className="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
)

export default function DashboardPage() {
	const { user, loading, isAuthenticated } = useAuth()
	const router = useRouter()
	const [projects, setProjects] = useState<Project[]>([])
	const [selectedProject, setSelectedProject] = useState<Project | null>(null)
	const [isCreateModalOpen, setCreateModalOpen] = useState(false)
	const [isUploadModalOpen, setUploadModalOpen] = useState(false)
	const [isSidebarOpen, setSidebarOpen] = useState(false)

	const handleRefreshProjects = useCallback(async () => {
		if (!isAuthenticated) return
		try {
			const res = await fetch("http://localhost:3001/api/projects", {
				credentials: "include",
			})
			if (res.ok) {
				const data = await res.json()
				setProjects(data)

				if (data.length === 0) {
					setSelectedProject(null)
					return
				}

				setSelectedProject((currentSelected) => {
					if (currentSelected) {
						const updatedProject = data.find(
							(p: Project) => p.id === currentSelected.id
						)
						return updatedProject || data[0]
					}
					return data[0]
				})
			}
		} catch (error) {
			console.error("Failed to fetch projects:", error)
		}
	}, [isAuthenticated])

	useEffect(() => {
		if (isAuthenticated) {
			handleRefreshProjects()
		} else if (!loading) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router, handleRefreshProjects])

	if (loading && projects.length === 0) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-black text-white">
				Loading dashboard...
			</div>
		)
	}

	return (
		<div className="flex h-screen w-full flex-col bg-[#0a0a0a] text-white">
			<Header onMenuClick={() => setSidebarOpen(!isSidebarOpen)} />
			<div className="flex flex-1 overflow-hidden">
				{isSidebarOpen && (
					<div
						className="fixed inset-0 z-10 bg-black/60 md:hidden"
						onClick={() => setSidebarOpen(false)}
					/>
				)}
				<ProjectSidebar
					projects={projects}
					selectedProject={selectedProject}
					onSelectProject={(project) => {
						setSelectedProject(project)
						setSidebarOpen(false)
					}}
					onCreateNew={() => setCreateModalOpen(true)}
					isSidebarOpen={isSidebarOpen}
				/>
				<ProjectContentView
					project={selectedProject}
					onUploadClick={() => setUploadModalOpen(true)}
				/>
				<CreateProjectModal
					isOpen={isCreateModalOpen}
					setIsOpen={setCreateModalOpen}
					onProjectCreated={handleRefreshProjects}
				/>
				<ImageUploadModal
					isOpen={isUploadModalOpen}
					onClose={() => setUploadModalOpen(false)}
					onUploadComplete={handleRefreshProjects}
					projectId={selectedProject?.id || null}
				/>
			</div>
		</div>
	)
}
