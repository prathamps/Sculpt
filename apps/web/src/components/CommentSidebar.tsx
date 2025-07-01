"use client"
import { useState, useEffect } from "react"
import { CommentCard } from "./CommentCard"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"
import { Filter, Search, MessageSquare, Plus, X, Send } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioItem,
	DropdownMenuRadioGroup,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { Comment } from "@/types"

// Demo data is now removed, we'll fetch real data

type CommentFilter = "all" | "unresolved" | "resolved"

interface CommentSidebarProps {
	className?: string
	imageVersionId: string
}

export function CommentSidebar({
	className,
	imageVersionId,
}: CommentSidebarProps) {
	const { user } = useAuth()
	const [searchQuery, setSearchQuery] = useState("")
	const [filter, setFilter] = useState<CommentFilter>("all")
	const [comments, setComments] = useState<Comment[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [newComment, setNewComment] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Fetch comments for this version
	useEffect(() => {
		const fetchComments = async () => {
			if (!imageVersionId) return

			setIsLoading(true)
			try {
				const res = await fetch(
					`http://localhost:3001/api/images/versions/${imageVersionId}/comments`,
					{
						credentials: "include",
					}
				)
				if (res.ok) {
					const data = await res.json()
					setComments(data)
				}
			} catch (error) {
				console.error("Failed to fetch comments:", error)
			} finally {
				setIsLoading(false)
			}
		}

		fetchComments()
	}, [imageVersionId])

	// Submit a new comment
	const handleSubmitComment = async () => {
		if (!newComment.trim() || !user?.id || !imageVersionId) return

		setIsSubmitting(true)
		try {
			const res = await fetch(
				`http://localhost:3001/api/images/versions/${imageVersionId}/comments`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({ content: newComment }),
				}
			)

			if (res.ok) {
				const comment = await res.json()
				setComments((prev) => [comment, ...prev])
				setNewComment("")
			}
		} catch (error) {
			console.error("Failed to submit comment:", error)
		} finally {
			setIsSubmitting(false)
		}
	}

	// Apply filters
	const filteredComments = comments.filter((comment) => {
		// Apply search filter
		const matchesSearch = comment.content
			.toLowerCase()
			.includes(searchQuery.toLowerCase())

		// Apply resolved/unresolved filter
		const matchesFilter =
			filter === "all" ||
			(filter === "resolved" && comment.resolved) ||
			(filter === "unresolved" && !comment.resolved)

		return matchesSearch && matchesFilter
	})

	return (
		<aside className={cn("flex flex-col bg-card", className)}>
			<div className="flex h-14 shrink-0 items-center justify-between border-b border-border/30 px-4">
				<div className="flex items-center gap-2">
					<MessageSquare className="h-4 w-4 text-muted-foreground" />
					<h2 className="text-sm font-medium">Comments</h2>
					<div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
						{comments.length}
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
				{isLoading ? (
					<div className="flex h-32 items-center justify-center">
						<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				) : filteredComments.length > 0 ? (
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

			{/* Comment input area */}
			<div className="border-t border-border/30 p-3">
				<Textarea
					placeholder="Add a comment..."
					value={newComment}
					onChange={(e) => setNewComment(e.target.value)}
					className="mb-2 min-h-[80px] text-sm"
				/>
				<Button
					size="sm"
					className="ml-auto flex items-center gap-1"
					onClick={handleSubmitComment}
					disabled={!newComment.trim() || isSubmitting}
				>
					{isSubmitting ? (
						<div className="h-3 w-3 animate-spin rounded-full border-2 border-background border-t-transparent" />
					) : (
						<Send className="h-3.5 w-3.5" />
					)}
					<span>Comment</span>
				</Button>
			</div>
		</aside>
	)
}
