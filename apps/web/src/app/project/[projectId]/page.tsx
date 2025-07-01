"use client"

import { useAuth } from "@/context/AuthContext"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { CreateProjectModal } from "@/components/CreateProjectModal"
import { ImageUploadModal } from "@/components/ImageUploadModal"
import { ProjectSidebar } from "@/components/ProjectSidebar"
import { ProjectContentView } from "@/components/ProjectContentView"
import { Header } from "@/components/Header"
import { Project } from "@/types"
import { Loader2 } from "lucide-react"

export default function ProjectPage() {
	const { loading, isAuthenticated } = useAuth()
	const router = useRouter()
	const params = useParams()
	const projectId = params.projectId as string

	const [projects, setProjects] = useState<Project[]>([])
	const [selectedProject, setSelectedProject] = useState<Project | null>(null)
	const [isCreateModalOpen, setCreateModalOpen] = useState(false)
	const [isUploadModalOpen, setUploadModalOpen] = useState(false)
	const [isSidebarOpen, setSidebarOpen] = useState(false)
	const [isProjectLoading, setIsProjectLoading] = useState(true)

	const handleRefreshProjects = useCallback(async () => {
		if (!isAuthenticated) return
		setIsProjectLoading(true)
		try {
			const res = await fetch("http://localhost:3001/api/projects", {
				credentials: "include",
			})
			if (res.ok) {
				const data: Project[] = await res.json()
				setProjects(data)

				const currentProject = data.find((p) => p.id === projectId)
				if (currentProject) {
					setSelectedProject(currentProject)
				} else if (data.length > 0) {
					// if current project not found, redirect to the first project
					router.replace(`/project/${data[0].id}`)
				}
			}
		} catch (error) {
			console.error("Failed to fetch projects:", error)
		} finally {
			setIsProjectLoading(false)
		}
	}, [isAuthenticated, projectId, router])

	useEffect(() => {
		if (isAuthenticated) {
			handleRefreshProjects()
		} else if (!loading) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router, handleRefreshProjects])

	if (loading) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			</div>
		)
	}

	return (
		<div className="flex h-screen w-full flex-col bg-background">
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
						router.push(`/project/${project.id}`)
						setSidebarOpen(false)
					}}
					onCreateNew={() => setCreateModalOpen(true)}
					isSidebarOpen={isSidebarOpen}
					onProjectChanged={handleRefreshProjects}
				/>

				{isProjectLoading ? (
					<div className="flex flex-1 items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<ProjectContentView
						project={selectedProject}
						onUploadClick={() => setUploadModalOpen(true)}
						onProjectChanged={handleRefreshProjects}
					/>
				)}

				<CreateProjectModal
					isOpen={isCreateModalOpen}
					setIsOpen={setCreateModalOpen}
					onProjectCreated={(newProject: Project) => {
						handleRefreshProjects()
						router.push(`/project/${newProject.id}`)
					}}
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
