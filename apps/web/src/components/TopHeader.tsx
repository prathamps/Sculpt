"use client"

import Link from "next/link"
import { ChevronLeft, MessageSquare, X } from "lucide-react"
import { Button } from "@/components/ui/button"
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
		<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-background/80 px-2 backdrop-blur-sm sm:px-4">
			<div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
				<Link
					href={`/project/${projectId}`}
					className="flex shrink-0 items-center gap-1.5 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Back to project"
				>
					<ChevronLeft className="h-4 w-4" aria-hidden="true" />
					<span className="hidden text-sm sm:inline">Back</span>
				</Link>
				<div className="mx-1 hidden h-4 w-px shrink-0 bg-border/60 sm:block" />
				<h1 className="min-w-[4rem] max-w-[40vw] truncate text-sm font-medium md:max-w-xs lg:max-w-md">
					{imageName}
				</h1>
				<div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{children}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button
					size={isSmallScreen ? "icon" : "sm"}
					variant="outline"
					className={cn(
						isSmallScreen ? "h-8 w-8" : "h-8 gap-1.5 text-xs",
						isSidebarOpen && "bg-primary/10 text-primary border-primary/20"
					)}
					onClick={onToggleSidebar}
					aria-label={isSidebarOpen ? "Close comments" : "Show comments"}
					aria-pressed={isSidebarOpen}
				>
					{isSmallScreen ? (
						isSidebarOpen ? (
							<X className="h-3.5 w-3.5" aria-hidden="true" />
						) : (
							<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
						)
					) : (
						<>
							{isSidebarOpen ? (
								<>
									<X className="h-3.5 w-3.5" aria-hidden="true" />
									Close Comments
								</>
							) : (
								<>
									<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
									Comments
								</>
							)}
						</>
					)}
				</Button>
			</div>
		</header>
	)
}
