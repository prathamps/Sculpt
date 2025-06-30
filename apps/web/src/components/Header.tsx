"use client"

import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { Menu } from "lucide-react"

interface HeaderProps {
	onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
	const { logout } = useAuth()
	return (
		<header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-800 bg-[#171717] px-4 md:px-6">
			<div className="flex items-center gap-4">
				<button onClick={onMenuClick} className="md:hidden">
					<Menu className="h-6 w-6" />
				</button>
				<Link href="/dashboard" className="hidden items-center gap-2 md:flex">
					{/* You can use an SVG or Image component for your logo */}
					<svg
						className="h-6 w-6 text-white"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"
						/>
					</svg>
					<span className="text-lg font-semibold text-white">Sculpt</span>
				</Link>
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Avatar className="h-9 w-9 cursor-pointer">
						<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
						<AvatarFallback>CN</AvatarFallback>
					</Avatar>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>Account Settings</DropdownMenuItem>
					<DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</header>
	)
}
