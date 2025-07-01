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
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { ReactNode } from "react"

interface TopHeaderProps {
	imageName: string
	projectId: string
	isSidebarOpen: boolean
	onToggleSidebar: () => void
	children?: ReactNode
}

export function TopHeader({
	imageName,
	projectId,
	isSidebarOpen,
	onToggleSidebar,
	children,
}: TopHeaderProps) {
	const isSmallScreen = useMediaQuery("(max-width: 768px)")

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
					<h1 className="text-sm font-medium truncate max-w-[120px] md:max-w-none">
						{imageName}
					</h1>
				</div>
				{children}
			</div>
			<div className="flex items-center gap-2">
				<div className="hidden sm:flex -space-x-2 overflow-hidden">
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
					size={isSmallScreen ? "icon" : "sm"}
					variant="outline"
					className={cn(
						isSmallScreen ? "h-8 w-8" : "h-8 gap-1.5 text-xs",
						isSidebarOpen && "bg-primary/10 text-primary border-primary/20"
					)}
					onClick={onToggleSidebar}
					title={isSidebarOpen ? "Close Comments" : "Show Comments"}
				>
					{isSmallScreen ? (
						isSidebarOpen ? (
							<X className="h-3.5 w-3.5" />
						) : (
							<MessageSquare className="h-3.5 w-3.5" />
						)
					) : (
						<>
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
						</>
					)}
				</Button>
				<Button
					size={isSmallScreen ? "icon" : "sm"}
					className={isSmallScreen ? "h-8 w-8" : "h-8 gap-1.5 text-xs"}
				>
					{isSmallScreen ? (
						<Share2 className="h-3.5 w-3.5" />
					) : (
						<>
							<Share2 className="h-3.5 w-3.5" />
							Share
						</>
					)}
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
