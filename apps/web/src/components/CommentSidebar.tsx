"use client"
import { useState } from "react"
import { CommentCard, Comment } from "./CommentCard"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Separator } from "./ui/separator"
import { Filter, Search, MessageSquare, Plus, X } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioItem,
	DropdownMenuRadioGroup,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"

const comments: Comment[] = [
	{
		id: "1",
		author: {
			name: "Marion Scott",
			avatarUrl: "https://randomuser.me/api/portraits/women/1.jpg",
		},
		timestamp: "Today 9:32 am",
		text: "@Marion_Scott please take a look this and suggest the changes",
	},
	{
		id: "2",
		author: {
			name: "Marion Scott",
			avatarUrl: "https://randomuser.me/api/portraits/women/2.jpg",
		},
		timestamp: "Today 9:32 am",
		text: "@Marion_Scott please take a look this and suggest the changes",
	},
	{
		id: "3",
		author: {
			name: "Lisa Seely",
			avatarUrl: "https://randomuser.me/api/portraits/women/3.jpg",
		},
		timestamp: "Today 9:32 am",
		text: "I want to leave a comment here",
		reactions: 2,
		replies: [
			{
				id: "3-1",
				author: {
					name: "Marion Scott",
					avatarUrl: "https://randomuser.me/api/portraits/men/1.jpg",
				},
				timestamp: "Today 9:33 am",
				text: "Sure, go ahead.",
			},
		],
	},
]

type CommentFilter = "all" | "unresolved" | "resolved"

export function CommentSidebar() {
	const [searchQuery, setSearchQuery] = useState("")
	const [filter, setFilter] = useState<CommentFilter>("all")

	const totalComments = comments.length

	const filteredComments = comments.filter((comment) =>
		comment.text.toLowerCase().includes(searchQuery.toLowerCase())
	)

	return (
		<aside className="flex w-80 flex-col border-l border-border/30 bg-card">
			<div className="flex h-14 shrink-0 items-center justify-between border-b border-border/30 px-4">
				<div className="flex items-center gap-2">
					<MessageSquare className="h-4 w-4 text-muted-foreground" />
					<h2 className="text-sm font-medium">Comments</h2>
					<div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
						{totalComments}
					</div>
				</div>
				<Button variant="ghost" size="icon" className="h-8 w-8">
					<Plus className="h-4 w-4" />
				</Button>
			</div>

			<div className="border-b border-border/30 p-2">
				<div className="relative mb-2">
					<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search comments"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-9 pl-9 text-sm"
					/>
				</div>

				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1 text-xs text-muted-foreground"
							>
								<Filter className="h-3.5 w-3.5" />
								{filter === "all"
									? "All comments"
									: filter === "resolved"
									? "Resolved"
									: "Unresolved"}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-40">
							<DropdownMenuRadioGroup
								value={filter}
								onValueChange={(v) => setFilter(v as CommentFilter)}
							>
								<DropdownMenuRadioItem value="all" className="text-xs">
									All comments
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="unresolved" className="text-xs">
									Unresolved
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="resolved" className="text-xs">
									Resolved
								</DropdownMenuRadioItem>
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				{filteredComments.length > 0 ? (
					<div className="divide-y divide-border/20 px-4">
						{filteredComments.map((comment) => (
							<div key={comment.id} className="py-4">
								<CommentCard comment={comment} />
							</div>
						))}
					</div>
				) : (
					<div className="flex h-full flex-col items-center justify-center p-4 text-center text-muted-foreground">
						<MessageSquare className="mb-2 h-10 w-10 opacity-20" />
						<p className="text-sm font-medium">No comments found</p>
						<p className="text-xs">
							{searchQuery
								? "Try a different search term"
								: "Add a comment to get started"}
						</p>
					</div>
				)}
			</div>
		</aside>
	)
}
