"use client"

import Link from "next/link"
import {
	ChevronLeft,
	ChevronDown,
	Circle,
	MoreHorizontal,
	Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface TopHeaderProps {
	imageName: string
}

export function TopHeader({ imageName }: TopHeaderProps) {
	return (
		<header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-700 bg-[#1e1f22] px-4">
			<div className="flex items-center gap-4">
				<Link
					href="/dashboard"
					className="flex items-center gap-2 text-lg font-semibold text-white"
				>
					<ChevronLeft className="h-5 w-5" />
					<span>{imageName}</span>
				</Link>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="gap-1">
							v2 <ChevronDown className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem>v2</DropdownMenuItem>
						<DropdownMenuItem>v1</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-300">
					<Circle className="h-3 w-3 fill-current" />
					<span>In Review</span>
					<ChevronDown className="h-4 w-4" />
				</div>
			</div>
			<div className="flex items-center gap-2">
				<div className="flex -space-x-2">
					<Avatar className="h-8 w-8 border-2 border-[#1e1f22]">
						<AvatarImage src="https://randomuser.me/api/portraits/women/4.jpg" />
						<AvatarFallback>A</AvatarFallback>
					</Avatar>
					<Avatar className="h-8 w-8 border-2 border-[#1e1f22]">
						<AvatarImage src="https://randomuser.me/api/portraits/men/2.jpg" />
						<AvatarFallback>B</AvatarFallback>
					</Avatar>
					<Avatar className="h-8 w-8 border-2 border-[#1e1f22]">
						<AvatarFallback>
							<Plus className="h-4 w-4" />
						</AvatarFallback>
					</Avatar>
				</div>
				<Button>Share</Button>
				<Button size="icon" variant="ghost">
					<MoreHorizontal className="h-5 w-5" />
				</Button>
			</div>
		</header>
	)
}
