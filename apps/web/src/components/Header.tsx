"use client"

import Link from "next/link"
import Image from "next/image"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { Menu, LogOut, Settings, User, ShieldAlert } from "lucide-react"
import { ModeToggle } from "@/components/ui/theme-toggle";
import { NotificationDropdown } from "./NotificationDropdown"

interface HeaderProps {
	onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
	const { user, logout } = useAuth()
	const isAdmin = user?.role === "ADMIN"

	return (
		<header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-sm md:px-6">
			<div className="flex items-center gap-4">
				{onMenuClick && (
					<button
						onClick={onMenuClick}
						className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary md:hidden"
					>
						<Menu className="h-5 w-5" />
					</button>
				)}
				<Link href="/dashboard" className="flex items-center gap-2">
					<Image src="/logo.png" alt="Sculpt Logo" width={35} height={35} />
					<span className="text-lg font-medium hidden md:inline-block">
						Sculpt
					</span>
				</Link>
			</div>
			<div className="flex items-center gap-2">
				<ModeToggle />
				{user && <NotificationDropdown />}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button className="flex items-center gap-2 rounded-full border border-border/50 bg-background px-2 py-1.5 text-sm hover:bg-secondary">
							<Avatar className="h-6 w-6">
								<AvatarImage
									src={`https://api.dicebear.com/7.x/micah/svg?seed=${
										user?.email || "user"
									}`}
									alt={user?.name || "User"}
								/>
								<AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
							</Avatar>
							<span className="hidden text-sm sm:inline-block">
								{user?.name || user?.email || "User"}
							</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<div className="px-3 py-2 text-xs text-muted-foreground truncate">
							{user?.email}
						</div>
						<DropdownMenuSeparator />
						{isAdmin && (
							<DropdownMenuItem asChild>
								<Link href="/admin">
									<span className="flex items-center">
										<ShieldAlert className="mr-2 h-4 w-4" />
										Admin Portal
									</span>
								</Link>
							</DropdownMenuItem>
						)}
						<DropdownMenuItem asChild>
							<Link href="/test-socket">
								<span className="flex items-center">
									<Settings className="mr-2 h-4 w-4" />
									Socket Test Page
								</span>
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem>
							<User className="mr-2 h-4 w-4" />
							Account Settings
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={logout} className="text-destructive">
							<LogOut className="mr-2 h-4 w-4" />
							Logout
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	)
}
