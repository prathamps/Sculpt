"use client"

import { useAuth } from "@/context/AuthContext"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { CreateProjectModal } from "@/components/CreateProjectModal"
import { ImageUploadModal } from "@/components/ImageUploadModal"
import { ProjectSidebar } from "@/components/ProjectSidebar"
import { ProjectContentView } from "@/components/ProjectContentView"
import { Header } from "@/components/Header"
import { Project, ProjectRole } from "@/types"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Paginated, api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { roleAtLeast } from "@/lib/utils"
import { useProjectFolders } from "@/hooks/useProjectFolders"
import { useProjectMedia } from "@/hooks/useProjectMedia"

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
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
	const [role, setRole] = useState<ProjectRole | null>(null)
	const { folders, refreshFolders } = useProjectFolders(projectId)
	const {
		images,
		isLoading: isMediaLoading,
		refresh: refreshMedia,
	} = useProjectMedia(projectId, isAuthenticated)

	const refreshProjectList = useCallback(async () => {
		if (!isAuthenticated) return
		try {
			const page = await api.get<Paginated<Project>>(
				"/api/projects?pageSize=100"
			)
			setProjects(page.items)
		} catch (error) {
			toast.error(describeError(error, "Could not load your projects."))
		}
	}, [isAuthenticated])

	const refreshSelectedProject = useCallback(async () => {
		if (!isAuthenticated || !projectId) return
		setIsProjectLoading(true)
		try {
			setSelectedProject(await api.get<Project>(`/api/projects/${projectId}`))
		} catch (error) {
			toast.error(describeError(error, "Could not load this project."))
			router.replace("/dashboard")
		} finally {
			setIsProjectLoading(false)
		}
	}, [isAuthenticated, projectId, router])

	const handleRefreshProjects = useCallback(async () => {
		await Promise.all([
			refreshProjectList(),
			refreshSelectedProject(),
			refreshMedia(),
		])
	}, [refreshProjectList, refreshSelectedProject, refreshMedia])

	useEffect(() => {
		if (isAuthenticated) {
			void refreshProjectList()
			void refreshSelectedProject()
		} else if (!loading) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router, refreshProjectList, refreshSelectedProject])

	useEffect(() => {
		setCurrentFolderId(null)
	}, [projectId])

	useEffect(() => {
		if (!isAuthenticated || !projectId) return
		let cancelled = false
		api
			.get<{ role: ProjectRole }>(`/api/projects/${projectId}/my-role`)
			.then((data) => {
				if (!cancelled) setRole(data.role)
			})
			.catch((): void => undefined)
		return (): void => {
			cancelled = true
		}
	}, [isAuthenticated, projectId])

	if (loading) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" aria-hidden="true" />
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
					onProjectChanged={refreshProjectList}
				/>

				{isProjectLoading || isMediaLoading ? (
					<div className="flex flex-1 items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
					</div>
				) : (
					<ProjectContentView
						project={selectedProject}
						images={images}
						onUploadClick={() => setUploadModalOpen(true)}
						onProjectChanged={() => {
							void handleRefreshProjects()
							refreshFolders()
						}}
						currentFolderId={currentFolderId}
						onNavigateFolder={setCurrentFolderId}
						folders={folders}
						onFoldersChanged={refreshFolders}
						canEdit={roleAtLeast(role, "EDITOR")}
					/>
				)}

				<CreateProjectModal
					isOpen={isCreateModalOpen}
					setIsOpen={setCreateModalOpen}
					onProjectCreated={(newProject: Project) => {
						void refreshProjectList()
						router.push(`/project/${newProject.id}`)
					}}
				/>
				<ImageUploadModal
					isOpen={isUploadModalOpen}
					onClose={() => setUploadModalOpen(false)}
					onUploadComplete={() => {
						void handleRefreshProjects()
						refreshFolders()
					}}
					projectId={selectedProject?.id || null}
					folderId={currentFolderId}
				/>
			</div>
		</div>
	)
}
