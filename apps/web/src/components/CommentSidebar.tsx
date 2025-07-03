"use client"
import { useState, useEffect, useCallback, useRef } from "react"
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
import { useSocket } from "@/context/SocketContext"
import { Comment } from "@/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

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
	const { socket, isConnected, joinImageVersion, leaveImageVersion } =
		useSocket()
	const [searchQuery, setSearchQuery] = useState("")
	const [filter, setFilter] = useState<CommentFilter>("all")
	const [comments, setComments] = useState<Comment[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const currentImageVersionIdRef = useRef<string | null>(null)

	const fetchComments = useCallback(async () => {
		if (!imageVersionId) return

		setIsLoading(true)
		try {
			const res = await fetch(
				`${API_URL}/api/images/versions/${imageVersionId}/comments`,
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
	}, [imageVersionId])

	useEffect(() => {
		fetchComments()
	}, [fetchComments])

	// Join image version room when component mounts or imageVersionId changes
	useEffect(() => {
		if (socket && isConnected && imageVersionId) {
			console.log(
				`[CommentSidebar] Setting up socket listeners for imageVersionId: ${imageVersionId}`
			)
			console.log(
				`[CommentSidebar] Socket ID: ${socket.id}, Connected: ${isConnected}`
			)

			// Use the centralized method to join the room
			joinImageVersion(imageVersionId)

			const handleNewComment = (newComment: Comment) => {
				console.log(`[CommentSidebar] Received new-comment event:`, newComment)
				if (newComment.imageVersionId === imageVersionId) {
					console.log(
						"[CommentSidebar] Comment is for current image version, updating state"
					)
					setComments((prev) => {
						// Check if comment already exists to prevent duplicates
						if (prev.some((c) => c.id === newComment.id)) {
							console.log("[CommentSidebar] Comment already exists, skipping")
							return prev
						}
						console.log("[CommentSidebar] Adding new comment to state")
						return [newComment, ...prev]
					})
				} else {
					console.log(
						`[CommentSidebar] Comment is for different image version (${newComment.imageVersionId}), ignoring`
					)
				}
			}

			const handleCommentUpdated = (updatedComment: Comment) => {
				console.log(
					`[CommentSidebar] Received comment-updated event:`,
					updatedComment
				)
				if (updatedComment.imageVersionId === imageVersionId) {
					console.log(
						"[CommentSidebar] Updated comment is for current image version, updating state"
					)
					setComments((prev) =>
						prev.map((c) => (c.id === updatedComment.id ? updatedComment : c))
					)
				}
			}

			const handleCommentDeleted = ({
				id,
				imageVersionId: M_imageVersionId,
			}: {
				id: string
				imageVersionId: string
			}) => {
				console.log(`[CommentSidebar] Received comment-deleted event:`, {
					id,
					imageVersionId: M_imageVersionId,
				})
				if (M_imageVersionId === imageVersionId) {
					console.log(
						"[CommentSidebar] Deleted comment is for current image version, updating state"
					)
					setComments((prev) => prev.filter((c) => c.id !== id))
				}
			}

			const handleLikeUpdate = ({
				id,
				count,
				liked,
				userId,
				imageVersionId: M_imageVersionId,
			}: any) => {
				console.log(`[CommentSidebar] Received comment-like-updated event:`, {
					id,
					count,
					liked,
					userId,
					imageVersionId: M_imageVersionId,
				})
				if (M_imageVersionId === imageVersionId) {
					console.log(
						"[CommentSidebar] Like update is for current image version, updating state"
					)
					setComments((prev) =>
						prev.map((c) =>
							c.id === id
								? {
										...c,
										likeCount: count,
										isLikedByCurrentUser:
											user?.id === userId ? liked : c.isLikedByCurrentUser,
								  }
								: c
						)
					)
				}
			}

			console.log("[CommentSidebar] Registering socket event handlers")
			socket.on("new-comment", handleNewComment)
			socket.on("comment-updated", handleCommentUpdated)
			socket.on("comment-deleted", handleCommentDeleted)
			socket.on("comment-like-updated", handleLikeUpdate)

			// Clean up event listeners when component unmounts or imageVersionId changes
			return () => {
				console.log(
					`[CommentSidebar] Cleaning up socket listeners for imageVersionId: ${imageVersionId}`
				)
				socket.off("new-comment", handleNewComment)
				socket.off("comment-updated", handleCommentUpdated)
				socket.off("comment-deleted", handleCommentDeleted)
				socket.off("comment-like-updated", handleLikeUpdate)
			}
		}
	}, [socket, isConnected, imageVersionId, user?.id, joinImageVersion])

	// Leave room when component unmounts
	useEffect(() => {
		return () => {
			if (imageVersionId) {
				leaveImageVersion(imageVersionId)
			}
		}
	}, [imageVersionId, leaveImageVersion])

	const handleCommentUpdate = useCallback(() => {
		fetchComments()
	}, [fetchComments])

	const handleHighlightAnnotation = (annotation: any) => {
		if (onHighlightAnnotation) {
			onHighlightAnnotation(annotation)
		}
	}

	// Apply filters
	const filteredComments = comments.filter((comment) => {
		const matchesSearch = comment.content
			.toLowerCase()
			.includes(searchQuery.toLowerCase())
		const matchesFilter =
			filter === "all" ||
			(filter === "resolved" && comment.resolved) ||
			(filter === "unresolved" && !comment.resolved)
		return matchesSearch && matchesFilter
	})

	return (
		<div
			className={cn(
				"flex flex-col bg-card text-card-foreground h-full",
				className
			)}
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
			<div
				className="flex-1 overflow-y-auto p-3 custom-scrollbar"
				style={{
					scrollbarWidth: "thin",
					scrollbarColor: "rgba(155, 155, 155, 0.5) transparent",
				}}
			>
				{comments.length > 0 ? (
					<div className="space-y-4 w-full">
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
