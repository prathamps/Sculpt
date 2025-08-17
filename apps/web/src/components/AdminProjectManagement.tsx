"use client"

import { useState, useEffect } from "react"
import { Table } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { ChevronRight } from "lucide-react"

interface User {
	id: string
	email: string
	name: string | null
}

interface ProjectMember {
	id: string
	projectId: string
	userId: string
	user: User
	role: "OWNER" | "MEMBER" | "EDITOR" | "VIEWER"
}

interface Project {
	id: string
	name: string
	members: ProjectMember[]
	createdAt: string
	updatedAt: string
	_count: {
		images: number
	}
}

interface ProjectDetail extends Project {
	images: Array<{
		id: string
		name: string
		versions: Array<{
			id: string
			versionName: string
			_count: {
				comments: number
			}
		}>
	}>
}

export function AdminProjectManagement() {
	const [projects, setProjects] = useState<Project[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(
		null
	)
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	useEffect(() => {
		const fetchProjects = async () => {
			try {
				const res = await fetch(`${URI}/api/admin/projects`, {
					credentials: "include",
				})

				if (!res.ok) {
					throw new Error("Failed to fetch projects")
				}

				const data = await res.json()
				setProjects(data)
			} catch (err) {
				setError("Error loading projects")
				console.error(err)
			} finally {
				setLoading(false)
			}
		}

		fetchProjects()
	}, [])

	const viewProjectDetails = async (projectId: string) => {
		setLoading(true)

		try {
			const res = await fetch(
				`http://localhost:3001/api/admin/projects/${projectId}`,
				{
					credentials: "include",
				}
			)

			if (!res.ok) {
				throw new Error("Failed to fetch project details")
			}

			const data = await res.json()
			setSelectedProject(data)
			setIsDialogOpen(true)
		} catch (err) {
			console.error("Error fetching project details:", err)
			alert("Failed to load project details")
		} finally {
			setLoading(false)
		}
	}

	if (loading) {
		return <div className="p-6">Loading projects...</div>
	}

	if (error) {
		return <div className="p-6 text-red-500">{error}</div>
	}

	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold mb-6">Project Management</h1>

			<div className="border rounded-md">
				<Table>
					<thead className="bg-muted/50">
						<tr>
							<th className="py-3 px-4 text-left font-medium">Project Name</th>
							<th className="py-3 px-4 text-left font-medium">Owner</th>
							<th className="py-3 px-4 text-left font-medium">Members</th>
							<th className="py-3 px-4 text-left font-medium">Images</th>
							<th className="py-3 px-4 text-left font-medium">Created</th>
							<th className="py-3 px-4 text-left font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{projects.map((project) => {
							const owner = project.members.find(
								(member) => member.role === "OWNER"
							)

							return (
								<tr key={project.id} className="border-t hover:bg-muted/50">
									<td className="py-3 px-4 font-medium truncate">
										{project.name}
									</td>
									<td className="py-3 px-4">
										{owner?.user.name || owner?.user.email || "Unknown"}
									</td>
									<td className="py-3 px-4">{project.members.length}</td>
									<td className="py-3 px-4">{project._count.images}</td>
									<td className="py-3 px-4">
										{new Date(project.createdAt).toLocaleDateString()}
									</td>
									<td className="py-3 px-4">
										<Button
											variant="outline"
											size="sm"
											className="flex items-center"
											onClick={() => viewProjectDetails(project.id)}
										>
											View Details
											<ChevronRight className="ml-2 h-4 w-4" />
										</Button>
									</td>
								</tr>
							)
						})}
					</tbody>
				</Table>
			</div>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Project Details</DialogTitle>
					</DialogHeader>

					{selectedProject && (
						<div className="space-y-6">
							<div>
								<h3 className="text-lg font-medium">Project Information</h3>
								<div className="mt-2 grid grid-cols-2 gap-4">
									<div>
										<p className="text-sm text-muted-foreground">
											Project Name
										</p>
										<p className="font-medium">{selectedProject.name}</p>
									</div>
									<div>
										<p className="text-sm text-muted-foreground">Created</p>
										<p className="font-medium">
											{new Date(selectedProject.createdAt).toLocaleDateString()}
										</p>
									</div>
								</div>
							</div>

							<div>
								<h3 className="text-lg font-medium">Members</h3>
								<div className="mt-2 border rounded-md">
									<Table>
										<thead className="bg-muted/50">
											<tr>
												<th className="py-2 px-4 text-left text-xs font-medium">
													Name
												</th>
												<th className="py-2 px-4 text-left text-xs font-medium">
													Email
												</th>
												<th className="py-2 px-4 text-left text-xs font-medium">
													Role
												</th>
											</tr>
										</thead>
										<tbody className="overflow-hidden">
											{selectedProject.members.map((member) => (
												<tr key={member.id} className="border-t">
													<td className="py-2 px-4 text-sm">
														{member.user.name || "No name"}
													</td>
													<td className="py-2 px-4 text-sm">
														{member.user.email}
													</td>
													<td className="py-2 px-4 text-sm">
														<span
															className={`inline-block px-2 py-0.5 rounded-full text-xs ${
																member.role === "OWNER"
																	? "bg-purple-100 text-purple-800"
																	: member.role === "EDITOR"
																	? "bg-blue-100 text-blue-800"
																	: "bg-gray-100 text-gray-800"
															}`}
														>
															{member.role}
														</span>
													</td>
												</tr>
											))}
										</tbody>
									</Table>
								</div>
							</div>

							<div>
								<h3 className="text-lg font-medium">Images</h3>
								<div className="mt-2 border rounded-md">
									<Table>
										<thead className="bg-muted/50">
											<tr>
												<th className="py-2 px-4 text-left text-xs font-medium">
													Image Name
												</th>
												<th className="py-2 px-4 text-left text-xs font-medium">
													Versions
												</th>
												<th className="py-2 px-4 text-left text-xs font-medium">
													Comments
												</th>
											</tr>
										</thead>
										<tbody className="overflow-hidden">
											{selectedProject.images.length === 0 ? (
												<tr>
													<td
														colSpan={3}
														className="py-4 px-4 text-center text-muted-foreground"
													>
														No images in this project
													</td>
												</tr>
											) : (
												selectedProject.images.map((image) => (
													<tr key={image.id} className="border-t">
														<td className="py-2 px-4 text-sm truncate">
															{image.name}
														</td>
														<td className="py-2 px-4 text-sm">
															{image.versions.length}
														</td>
														<td className="py-2 px-4 text-sm">
															{image.versions.reduce(
																(acc, version) => acc + version._count.comments,
																0
															)}
														</td>
													</tr>
												))
											)}
										</tbody>
									</Table>
								</div>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
