"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAdminAuth } from "@/context/AdminAuthContext"
import {
	BarChart3,
	Users,
	FolderKanban,
	Settings,
	Menu,
	X,
	LogOut,
} from "lucide-react"
import { Button } from "./ui/button"

interface AdminLayoutProps {
	children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
	const pathname = usePathname()
	const [isSidebarOpen, setIsSidebarOpen] = useState(true)
	const { adminLogout } = useAdminAuth()

	const toggleSidebar = () => {
		setIsSidebarOpen(!isSidebarOpen)
	}

	const navigation = [
		{
			name: "Dashboard",
			href: "/admin",
			icon: BarChart3,
			current: pathname === "/admin",
		},
		{
			name: "Users",
			href: "/admin/users",
			icon: Users,
			current: pathname === "/admin/users",
		},
		{
			name: "Projects",
			href: "/admin/projects",
			icon: FolderKanban,
			current: pathname === "/admin/projects",
		},
		{
			name: "Settings",
			href: "/admin/settings",
			icon: Settings,
			current: pathname === "/admin/settings",
		},
	]

	return (
		<div className="flex h-screen flex-col">
			<header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-sm md:px-6">
				<div className="flex items-center gap-4">
					<button
						onClick={toggleSidebar}
						className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary md:hidden"
					>
						{isSidebarOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Menu className="h-5 w-5" />
						)}
					</button>

					<div className="flex items-center gap-2">
						<Link href="/admin" className="flex items-center gap-1">
							<span className="font-semibold text-lg">Sculpt Admin</span>
						</Link>
					</div>
				</div>

				<Button
					variant="ghost"
					size="sm"
					onClick={adminLogout}
					className="text-muted-foreground"
				>
					<LogOut className="mr-2 h-4 w-4" />
					Logout
				</Button>
			</header>

			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar */}
				<div
					className={cn(
						"bg-muted/40 border-r transition-all duration-300 ease-in-out",
						isSidebarOpen ? "w-64" : "w-0 -ml-64 md:w-16 md:ml-0"
					)}
				>
					<div className="flex h-16 items-center justify-between px-4">
						<h2
							className={cn(
								"text-lg font-semibold transition-opacity",
								isSidebarOpen ? "opacity-100" : "opacity-0 md:hidden"
							)}
						>
							Admin Portal
						</h2>
					</div>

					<nav className="space-y-1 px-2">
						{navigation.map((item) => (
							<Link
								key={item.name}
								href={item.href}
								className={cn(
									"flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
									item.current
										? "bg-primary/10 text-primary"
										: "text-muted-foreground hover:bg-muted hover:text-foreground"
								)}
							>
								<item.icon
									className={cn(
										"h-5 w-5",
										item.current ? "text-primary" : "text-muted-foreground"
									)}
								/>
								<span
									className={cn(
										"transition-opacity",
										isSidebarOpen ? "opacity-100" : "opacity-0 md:hidden"
									)}
								>
									{item.name}
								</span>
							</Link>
						))}
					</nav>
				</div>

				{/* Main content */}
				<div className="flex-1 overflow-auto">{children}</div>
			</div>
		</div>
	)
}
