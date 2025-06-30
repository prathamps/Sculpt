"use client"

import Image from "next/image"
import Link from "next/link"
import { PlayCircle, MessageSquare, User, MoreHorizontal } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"

interface File {
	id: string
	name: string
	url: string
	// Add other properties like type (image/video), author, date, commentCount
}

interface FileCardProps {
	file: File
	projectId: string
}

export function FileCard({ file, projectId }: FileCardProps) {
	const isVideo = file.name.endsWith(".mp4") // Simple check

	return (
		<div className="group relative flex flex-col rounded-lg bg-gray-800">
			<Link
				href={`/projects/${file.id}`}
				className="relative aspect-video w-full overflow-hidden rounded-t-lg"
			>
				<Image
					src={`http://localhost:3001/${file.url}`}
					alt={file.name}
					fill
					className="object-contain transition-transform duration-300"
				/>
				<div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
				{isVideo && (
					<div className="absolute inset-0 flex items-center justify-center">
						<PlayCircle className="h-12 w-12 text-white/80" />
					</div>
				)}
			</Link>
			<div className="p-3 text-white">
				<div className="flex items-start justify-between">
					<p className="flex-1 truncate font-semibold pr-2">{file.name}</p>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button className="text-gray-400 hover:text-white -mt-1">
								<MoreHorizontal className="h-5 w-5" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem>Edit file name</DropdownMenuItem>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>Set progress</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									<DropdownMenuItem>Active</DropdownMenuItem>
									<DropdownMenuItem>In Progress</DropdownMenuItem>
									<DropdownMenuItem>Approved</DropdownMenuItem>
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="mt-1 flex items-center justify-between text-xs text-gray-300">
					<div className="flex items-center gap-1">
						<User className="h-4 w-4" />
						<span>Pranav</span>
					</div>
					<div className="flex items-center gap-1">
						<MessageSquare className="h-4 w-4" />
						<span>4</span>
					</div>
				</div>
			</div>
		</div>
	)
}
