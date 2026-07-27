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
import { toast } from "sonner"
import { Paginated, api } from "@/lib/api"
import { describeError } from "@/lib/errors"

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
			const page = await api.get<Paginated<Project>>(
				"/api/projects?pageSize=100"
			)
			setProjects(page.items)

			const currentProject = page.items.find(
				(project) => project.id === projectId
			)
			if (currentProject) {
				setSelectedProject(currentProject)
			} else if (page.items[0]?.id) {
				router.replace(`/project/${page.items[0].id}`)
			}
		} catch (error) {
			toast.error(describeError(error, "Could not load your projects."))
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
