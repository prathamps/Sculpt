"use client"

import { Button } from "./ui/button"
import { FileCard } from "./FileCard"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface Project {
	id: string
	name: string
	images: { id: string; url: string; name: string }[]
}

interface ProjectContentViewProps {
	project: Project | null
	onUploadClick: () => void
}

export function ProjectContentView({
	project,
	onUploadClick,
}: ProjectContentViewProps) {
	if (!project) {
		return (
			<div className="flex-1 p-8">
				<div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-gray-700 text-gray-500">
					Select a project to view its files, or create a new one.
				</div>
			</div>
		)
	}

	return (
		<main className="flex-1 flex-col p-6">
			{/* Project Header */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">{project.name}</h1>
					<p className="text-sm text-gray-400">
						Donec tempus blandit mi. Sed non porttitor lorem, ut ultrices nibh.
					</p>
				</div>
				<Button onClick={onUploadClick}>Upload File</Button>
			</div>

			{/* Files Grid */}
			<div className="flex items-center justify-between pb-4">
				<h3 className="text-lg font-semibold">Showing all files</h3>
			</div>
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{project.images.map((image) => (
					<FileCard key={image.id} file={image} projectId={project.id} />
				))}
			</div>
			{project.images.length === 0 && (
				<div className="mt-8 text-center text-gray-500">
					<p>This project has no files yet.</p>
					<Button variant="secondary" className="mt-4" onClick={onUploadClick}>
						Upload File
					</Button>
				</div>
			)}
		</main>
	)
}
