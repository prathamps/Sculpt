"use client"

import { useAuth } from "@/context/AuthContext"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { CreateProjectModal } from "@/components/CreateProjectModal"
import { ProjectCard } from "@/components/ProjectCard"
import { Header } from "@/components/Header"
import { Project } from "@/types"
import { ProjectSettingsModal } from "@/components/ProjectSettingsModal"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { PlusIcon, Loader2Icon, FolderPlusIcon } from "lucide-react"

export default function DashboardPage() {
	const { user, loading, isAuthenticated } = useAuth()
	const router = useRouter()
	const [projects, setProjects] = useState<Project[]>([])
	const [isCreateModalOpen, setCreateModalOpen] = useState(false)
	const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
	const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)
	const [isLoading, setIsLoading] = useState(true)

	const handleRefreshProjects = useCallback(async () => {
		if (!isAuthenticated) return
		setIsLoading(true)
		try {
			const res = await fetch("http://localhost:3001/api/projects", {
				credentials: "include",
			})
			if (res.ok) {
				const data: Project[] = await res.json()
				setProjects(data)
			}
		} catch (error) {
			console.error("Failed to fetch projects:", error)
		} finally {
			setIsLoading(false)
		}
	}, [isAuthenticated])

	useEffect(() => {
		if (isAuthenticated) {
			handleRefreshProjects()
		} else if (!loading) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router, handleRefreshProjects])

	const handleDeleteProject = async () => {
		if (!projectToDelete) return
		setIsDeleting(true)
		try {
			const res = await fetch(
				`http://localhost:3001/api/projects/${projectToDelete.id}`,
				{
					method: "DELETE",
					credentials: "include",
				}
			)

			if (!res.ok) {
				throw new Error("Failed to delete project")
			}

			handleRefreshProjects()
			setProjectToDelete(null)
		} catch (error) {
			console.error("Failed to delete project:", error)
			alert("Failed to delete project.")
		} finally {
			setIsDeleting(false)
		}
	}

	if (loading) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2Icon className="h-8 w-8 animate-spin text-primary/70" />
			</div>
		)
	}

	return (
		<div className="flex min-h-screen w-full flex-col bg-background">
			<Header />
			<main className="flex-1 overflow-y-auto p-4 md:p-8">
				<div className="mx-auto max-w-7xl">
					<div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between">
						<h1 className="text-2xl font-semibold md:text-3xl">Projects</h1>
						<Button
							onClick={() => setCreateModalOpen(true)}
							className="mt-4 sm:mt-0"
						>
							<PlusIcon className="mr-1 h-4 w-4" />
							New Project
						</Button>
					</div>

					{isLoading ? (
						<div className="flex h-40 items-center justify-center">
							<Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : projects.length > 0 ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
							{projects.map((project) => (
								<ProjectCard
									key={project.id}
									project={project}
									onEdit={setProjectToEdit}
									onDelete={setProjectToDelete}
								/>
							))}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
								<FolderPlusIcon className="h-6 w-6" />
							</div>
							<h2 className="mt-4 text-xl font-medium">No projects yet</h2>
							<p className="mt-2 max-w-sm text-muted-foreground">
								Get started by creating your first project to organize and
								collaborate on your images.
							</p>
							<Button className="mt-6" onClick={() => setCreateModalOpen(true)}>
								<PlusIcon className="mr-2 h-4 w-4" />
								Create Project
							</Button>
						</div>
					)}
				</div>
			</main>
			<CreateProjectModal
				isOpen={isCreateModalOpen}
				setIsOpen={setCreateModalOpen}
				onProjectCreated={handleRefreshProjects}
			/>
			<ProjectSettingsModal
				isOpen={!!projectToEdit}
				onClose={() => setProjectToEdit(null)}
				project={projectToEdit}
				onProjectChanged={() => {
					handleRefreshProjects()
					setProjectToEdit(null)
				}}
			/>
			<ConfirmationModal
				isOpen={!!projectToDelete}
				onClose={() => setProjectToDelete(null)}
				onConfirm={handleDeleteProject}
				title="Delete Project"
				description={`Are you sure you want to delete "${projectToDelete?.name}"? This action cannot be undone.`}
				isConfirming={isDeleting}
			/>
		</div>
	)
}
