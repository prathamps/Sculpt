"use client"

import Image from "next/image"
import Link from "next/link"
import { Pencil, Trash2, ExternalLink } from "lucide-react"

interface Project {
	id: string
	name: string
	images: { id: string; url: string; name: string }[]
}

interface ProjectCardProps {
	project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
	const firstImage = project.images?.[0]

	return (
		<div className="group relative aspect-video w-full overflow-hidden rounded-lg">
			<Link href={`/projects/${firstImage?.id || project.id}`}>
				{firstImage ? (
					<Image
						src={`http://localhost:3001/${firstImage.url}`}
						alt={project.name}
						fill
						className="object-cover transition-transform duration-300 group-hover:scale-105"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-gray-800">
						<span className="text-gray-500">{project.name}</span>
					</div>
				)}
				<div className="absolute inset-0 bg-black/20" />
			</Link>
			<div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
				<button className="rounded-full bg-white/20 p-2 text-white backdrop-blur-sm hover:bg-white/30">
					<ExternalLink className="h-5 w-5" />
				</button>
				<button className="rounded-full bg-white/20 p-2 text-white backdrop-blur-sm hover:bg-white/30">
					<Pencil className="h-5 w-5" />
				</button>
				<button className="rounded-full bg-red-500/50 p-2 text-white backdrop-blur-sm hover:bg-red-500/70">
					<Trash2 className="h-5 w-5" />
				</button>
			</div>
		</div>
	)
}
