import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
	ThumbsUp,
	MessageSquareReply,
	MoreHorizontal,
	CheckCircle2,
	Trash2,
	Edit3,
	Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Comment as CommentType } from "@/types"
import { formatDistanceToNow } from "date-fns"
import { useAuth } from "@/context/AuthContext"
import { Textarea } from "@/components/ui/textarea"

interface CommentCardProps {
	comment: CommentType
	onCommentUpdate?: () => void
	onHighlightAnnotation?: (annotation: any) => void
}

export function CommentCard({
	comment,
	onCommentUpdate,
	onHighlightAnnotation,
}: CommentCardProps) {
	const { user } = useAuth()
	const [isDeleting, setIsDeleting] = useState(false)
	const [isLiking, setIsLiking] = useState(false)
	const [likeCount, setLikeCount] = useState(comment.likeCount || 0)
	const [isLiked, setIsLiked] = useState(comment.isLikedByCurrentUser || false)
	const [isReplying, setIsReplying] = useState(false)
	const [replyContent, setReplyContent] = useState("")
	const [isSubmittingReply, setIsSubmittingReply] = useState(false)

	// Format timestamp
	const timestamp = formatDistanceToNow(new Date(comment.createdAt), {
		addSuffix: true,
	})

	// Check if current user is the author of the comment
	const isAuthor = user?.id === comment.userId

	// Handle resolve/unresolve
	const toggleResolved = async () => {
		try {
			const res = await fetch(
				`http://localhost:3001/api/images/comments/${comment.id}/resolve`,
				{
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
				}
			)

			if (res.ok) {
				// Notify parent component to refresh comments
				if (onCommentUpdate) {
					onCommentUpdate()
				}
			}
		} catch (error) {
			console.error("Error updating resolved status:", error)
		}
	}

	// Handle like
	const handleLike = async () => {
		if (isLiking) return

		setIsLiking(true)
		try {
			const res = await fetch(
				`http://localhost:3001/api/images/comments/${comment.id}/like`,
				{
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
				}
			)

			if (res.ok) {
				const data = await res.json()
				setLikeCount(data.count)
				setIsLiked(data.liked)
			}
		} catch (error) {
			console.error("Error toggling like:", error)
		} finally {
			setIsLiking(false)
		}
	}

	// Handle delete
	const handleDelete = async () => {
		if (!isAuthor || isDeleting) return

		setIsDeleting(true)
		try {
			const res = await fetch(
				`http://localhost:3001/api/images/comments/${comment.id}`,
				{
					method: "DELETE",
					credentials: "include",
				}
			)

			if (res.ok) {
				// Notify parent component to refresh comments
				if (onCommentUpdate) {
					onCommentUpdate()
				}
			}
		} catch (error) {
			console.error("Error deleting comment:", error)
		} finally {
			setIsDeleting(false)
		}
	}

	// Handle annotation highlighting
	const handleCardClick = () => {
		if (comment.annotation && onHighlightAnnotation) {
			// Pass the annotation data directly, whether it's an array or a single object
			onHighlightAnnotation(comment.annotation)
		}
	}

	// Count annotations if they're stored as an array
	const annotationCount = Array.isArray(comment.annotation)
		? comment.annotation.length
		: comment.annotation
		? 1
		: 0

	// Handle reply submission
	const submitReply = async () => {
		if (!replyContent.trim() || isSubmittingReply) return

		setIsSubmittingReply(true)
		try {
			const response = await fetch(
				`http://localhost:3001/api/images/versions/${comment.imageVersionId}/comments`,
				{
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						content: replyContent,
						parentId: comment.id,
					}),
				}
			)

			if (response.ok) {
				setReplyContent("")
				setIsReplying(false)
				if (onCommentUpdate) {
					onCommentUpdate()
				}
			}
		} catch (error) {
			console.error("Error submitting reply:", error)
		} finally {
			setIsSubmittingReply(false)
		}
	}

	return (
		<div
			className={cn(
				"flex flex-col gap-3 w-full",
				comment.annotation &&
					"cursor-pointer hover:bg-accent/10 rounded p-2 -m-2"
			)}
			onClick={handleCardClick}
		>
			<div className="flex items-start gap-2.5 w-full">
				<Avatar className="h-7 w-7 flex-shrink-0">
					<AvatarFallback>
						{comment.user.name?.charAt(0) || comment.user.email.charAt(0)}
					</AvatarFallback>
				</Avatar>
				<div className="flex-1 space-y-1.5 min-w-0">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">
								{comment.user.name || comment.user.email}
							</span>
							<span className="text-xs text-muted-foreground">{timestamp}</span>
							{comment.resolved && (
								<span className="flex items-center gap-1 text-xs text-green-500">
									<CheckCircle2 className="h-3 w-3" />
									Resolved
								</span>
							)}
							{annotationCount > 0 && (
								<span className="flex items-center gap-1 text-xs text-blue-500">
									<Edit3 className="h-3 w-3" />
									{annotationCount > 1
										? `${annotationCount} drawings`
										: "Has drawing"}
								</span>
							)}
						</div>
						<div className="flex items-center gap-1">
							{isAuthor && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6 text-muted-foreground"
										>
											<MoreHorizontal className="h-3.5 w-3.5" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48">
										<DropdownMenuItem
											className="text-xs"
											onClick={(e) => {
												e.stopPropagation()
												toggleResolved()
											}}
										>
											Mark as {comment.resolved ? "unresolved" : "resolved"}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="text-xs text-destructive"
											onClick={handleDelete}
											disabled={isDeleting}
										>
											{isDeleting ? (
												<>
													<Trash2 className="mr-2 h-3.5 w-3.5" />
													Deleting...
												</>
											) : (
												<>
													<Trash2 className="mr-2 h-3.5 w-3.5" />
													Delete comment
												</>
											)}
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					</div>
					<p
						className="text-sm leading-relaxed break-words whitespace-pre-wrap max-w-full overflow-hidden"
						style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
					>
						{comment.content}
					</p>
					<div className="flex items-center gap-3">
						<Button
							variant="ghost"
							size="sm"
							className={cn(
								"h-7 gap-1.5 px-2 text-xs",
								isLiked
									? "text-primary"
									: "text-muted-foreground hover:text-foreground"
							)}
							onClick={(e) => {
								e.stopPropagation()
								handleLike()
							}}
							disabled={isLiking}
						>
							<ThumbsUp
								className={cn("h-3.5 w-3.5", isLiked && "fill-primary")}
							/>
							{likeCount > 0 && likeCount} Like{likeCount !== 1 && "s"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
							onClick={(e) => {
								e.stopPropagation()
								setIsReplying(!isReplying)
							}}
						>
							<MessageSquareReply className="h-3.5 w-3.5" />
							Reply
						</Button>
					</div>

					{isReplying && (
						<div
							className="mt-2 flex flex-col gap-2"
							onClick={(e) => e.stopPropagation()}
						>
							<Textarea
								placeholder="Write a reply..."
								className="min-h-[60px] text-xs"
								value={replyContent}
								onChange={(e) => setReplyContent(e.target.value)}
							/>
							<div className="flex justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									className="h-7 text-xs"
									onClick={() => setIsReplying(false)}
								>
									Cancel
								</Button>
								<Button
									size="sm"
									className="h-7 text-xs"
									onClick={submitReply}
									disabled={!replyContent.trim() || isSubmittingReply}
								>
									{isSubmittingReply ? (
										<>
											<Send className="mr-1 h-3 w-3 animate-pulse" />
											Sending...
										</>
									) : (
										<>
											<Send className="mr-1 h-3 w-3" />
											Reply
										</>
									)}
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
			{comment.replies && comment.replies.length > 0 && (
				<div
					className="ml-9 flex flex-col gap-3 border-l-2 border-border/50 pl-3 w-full"
					onClick={(e) => e.stopPropagation()}
				>
					{comment.replies.map((reply) => (
						<CommentCard
							key={reply.id}
							comment={reply}
							onCommentUpdate={onCommentUpdate}
							onHighlightAnnotation={onHighlightAnnotation}
						/>
					))}
				</div>
			)}
		</div>
	)
}
