"use client"

import Link from "next/link"
import {
	ChevronLeft,
	ChevronDown,
	Circle,
	MoreHorizontal,
	Plus,
	Share2,
	MessageSquare,
	X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface TopHeaderProps {
	imageName: string
	projectId: string
	isSidebarOpen: boolean
	onToggleSidebar: () => void
}

export function TopHeader({
	imageName,
	projectId,
	isSidebarOpen,
	onToggleSidebar,
}: TopHeaderProps) {
	return (
		<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-sm">
			<div className="flex items-center gap-3">
				<Link
					href={`/project/${projectId}`}
					className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft className="h-4 w-4" />
					<span className="text-sm">Back</span>
				</Link>
				<div className="mx-1 h-4 w-px bg-border/60" />
				<div className="flex items-center">
					<h1 className="text-sm font-medium">{imageName}</h1>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="h-7 gap-1 rounded-md text-xs"
						>
							Version 2 <ChevronDown className="h-3.5 w-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem className="text-xs">
							Version 2 (Current)
						</DropdownMenuItem>
						<DropdownMenuItem className="text-xs">Version 1</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
					<Circle className="h-2 w-2 fill-current" />
					<span>In Review</span>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<div className="flex -space-x-2 overflow-hidden">
					<Avatar className="h-7 w-7 border-2 border-background">
						<AvatarImage src="https://randomuser.me/api/portraits/women/4.jpg" />
						<AvatarFallback>A</AvatarFallback>
					</Avatar>
					<Avatar className="h-7 w-7 border-2 border-background">
						<AvatarImage src="https://randomuser.me/api/portraits/men/2.jpg" />
						<AvatarFallback>B</AvatarFallback>
					</Avatar>
					<Avatar className="h-7 w-7 border-2 border-background bg-muted">
						<AvatarFallback className="text-xs">
							<Plus className="h-3.5 w-3.5" />
						</AvatarFallback>
					</Avatar>
				</div>
				<Button
					size="sm"
					variant="outline"
					className="gap-1.5 text-xs"
					onClick={onToggleSidebar}
				>
					{isSidebarOpen ? (
						<>
							<X className="h-3.5 w-3.5" />
							Close Comments
						</>
					) : (
						<>
							<MessageSquare className="h-3.5 w-3.5" />
							Comments
						</>
					)}
				</Button>
				<Button size="sm" className="gap-1.5 text-xs">
					<Share2 className="h-3.5 w-3.5" />
					Share
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost" className="h-8 w-8">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem>Download Image</DropdownMenuItem>
						<DropdownMenuItem>Export Annotations</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="text-destructive">
							Delete Image
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	)
}
