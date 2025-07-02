"use client"
import { useState, useEffect, useCallback } from "react"
import { CommentCard } from "./CommentCard"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Filter, Search, MessageSquare, Plus, Loader2 } from "lucide-react"
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
	imageVersionId: string
	className?: string
	onHighlightAnnotation?: (annotation: any) => void
}

export function CommentSidebar({
	imageVersionId,
	className,
	onHighlightAnnotation,
}: CommentSidebarProps) {
	const { user } = useAuth()
	const [searchQuery, setSearchQuery] = useState("")
	const [filter, setFilter] = useState<CommentFilter>("all")
	const [comments, setComments] = useState<Comment[]>([])
	const [isLoading, setIsLoading] = useState(false)

	const fetchComments = useCallback(async () => {
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
				// Transform data to include like information
				const commentsWithLikes = data.map((comment: Comment) => {
					// Calculate like count
					const likeCount = comment.likes?.length || 0

					// Check if current user has liked this comment
					const isLikedByCurrentUser =
						comment.likes?.some((like) => like.userId === user?.id) || false

					return {
						...comment,
						likeCount,
						isLikedByCurrentUser,
						// Process replies with likes as well
						replies: comment.replies?.map((reply) => {
							const replyLikeCount = reply.likes?.length || 0
							const replyIsLikedByCurrentUser =
								reply.likes?.some((like) => like.userId === user?.id) || false

							return {
								...reply,
								likeCount: replyLikeCount,
								isLikedByCurrentUser: replyIsLikedByCurrentUser,
							}
						}),
					}
				})

				setComments(commentsWithLikes)
			}
		} catch (error) {
			console.error("Failed to fetch comments:", error)
		} finally {
			setIsLoading(false)
		}
	}, [imageVersionId, user])

	useEffect(() => {
		if (imageVersionId) {
			fetchComments()
		}
	}, [imageVersionId, fetchComments])

	const handleCommentUpdate = useCallback(() => {
		fetchComments()
	}, [fetchComments])

	const handleHighlightAnnotation = (annotation: any) => {
		if (onHighlightAnnotation) {
			// If annotation is an array, pass it directly to the parent component
			// If it's a single object, pass it as is
			onHighlightAnnotation(annotation)
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
		<div
			className={cn("flex flex-col bg-card text-card-foreground", className)}
		>
			<div className="flex items-center justify-between border-b border-border/40 p-3">
				<h3 className="text-sm font-medium">Comments</h3>
				{isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
			</div>
			<div className="flex items-center gap-2 border-b border-border/40 p-3">
				<div className="relative flex-1">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-8 pl-8"
						placeholder="Search comments..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="h-8 gap-1">
							<Filter className="h-3.5 w-3.5" />
							<span className="capitalize">{filter}</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuRadioGroup
							value={filter}
							onValueChange={(value) => setFilter(value as CommentFilter)}
						>
							<DropdownMenuRadioItem value="all" className="text-xs">
								All
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
			<div className="flex-1 overflow-y-auto p-3">
				{comments.length > 0 ? (
					<div className="space-y-4">
						{filteredComments.length > 0 ? (
							filteredComments.map((comment) => (
								<CommentCard
									key={comment.id}
									comment={comment}
									onCommentUpdate={handleCommentUpdate}
									onHighlightAnnotation={handleHighlightAnnotation}
								/>
							))
						) : (
							<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
								<p className="text-sm">No matching comments found</p>
								<p className="text-xs">Try adjusting your search or filter</p>
							</div>
						)}
					</div>
				) : (
					<div className="flex h-full flex-col items-center justify-center text-muted-foreground">
						<MessageSquare className="mb-2 h-12 w-12 opacity-20" />
						<p className="text-sm">No comments yet</p>
						<p className="text-xs">
							Start the conversation by adding a comment below
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
