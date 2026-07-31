import { useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
	ThumbsUp,
	MessageSquareReply,
	MoreHorizontal,
	CheckCircle2,
	Trash2,
	Edit3,
	Send,
	Clock,
	FileText,
	MapPin,
} from "lucide-react"
import { cn, formatVideoTime } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Comment as CommentType, CommentMention } from "@/types"
import { formatDistanceToNow } from "date-fns"
import { useAuth } from "@/context/AuthContext"
import { MentionTextarea } from "@/components/MentionTextarea"
import { useMentionDraft } from "@/hooks/useMentionDraft"

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const renderWithMentions = (
	content: string,
	mentions?: CommentMention[]
): React.ReactNode => {
	const labels = (mentions ?? [])
		.map((mention) => mention.user?.name)
		.filter((name): name is string => !!name)
	if (labels.length === 0) return content

	const tokens = new Set(labels.map((label) => `@${label}`))
	const pattern = new RegExp(
		`(${labels.map((label) => `@${escapeRegExp(label)}`).join("|")})`,
		"g"
	)
	return content.split(pattern).map((part, index) =>
		tokens.has(part) ? (
			<span key={index} className="font-medium text-primary">
				{part}
			</span>
		) : (
			part
		)
	)
}

interface CommentCardProps {
	comment: CommentType
	onCommentUpdate?: () => void
	onSelectComment?: (comment: CommentType) => void
	isSelected?: boolean
	onSeek?: (t: number) => void
	onGoToPage?: (page: number) => void
	canReply?: boolean
}

export function CommentCard({
	comment,
	onCommentUpdate,
	onSelectComment,
	isSelected = false,
	onSeek,
	onGoToPage,
	canReply = true,
}: CommentCardProps) {
	const { user } = useAuth()
	const [isDeleting, setIsDeleting] = useState(false)
	const [isLiking, setIsLiking] = useState(false)
	const [pendingLike, setPendingLike] = useState<{
		count: number
		liked: boolean
	} | null>(null)
	const [isReplying, setIsReplying] = useState(false)
	const [replyContent, setReplyContent] = useState("")
	const [isSubmittingReply, setIsSubmittingReply] = useState(false)
	const { addMention, mentionIdsIn, resetMentions } = useMentionDraft()

	const likeCount = pendingLike?.count ?? comment.likeCount ?? 0
	const isLiked = pendingLike?.liked ?? comment.isLikedByCurrentUser ?? false

	useEffect(() => {
		setPendingLike(null)
	}, [comment.likeCount, comment.isLikedByCurrentUser])

	const timestamp = formatDistanceToNow(new Date(comment.createdAt), {
		addSuffix: true,
	})

	const isAuthor = user?.id === comment.userId

	const toggleResolved = async () => {
		try {
			await api.post(`/api/images/comments/${comment.id}/resolve`)
			onCommentUpdate?.()
		} catch (error) {
			toast.error(describeError(error, "Could not update the comment."))
		}
	}

	const handleLike = async () => {
		if (isLiking) return

		setIsLiking(true)
		try {
			const result = await api.post<{ liked: boolean; count: number }>(
				`/api/images/comments/${comment.id}/like`
			)
			setPendingLike({ count: result.count, liked: result.liked })
		} catch (error) {
			toast.error(describeError(error, "Could not update your like."))
		} finally {
			setIsLiking(false)
		}
	}

	const handleDelete = async () => {
		if (!isAuthor || isDeleting) return

		setIsDeleting(true)
		try {
			await api.delete(`/api/images/comments/${comment.id}`)
			onCommentUpdate?.()
		} catch (error) {
			toast.error(describeError(error, "Could not delete the comment."))
		} finally {
			setIsDeleting(false)
		}
	}

	const hasTimestamp = typeof comment.timestamp === "number"
	const hasRange =
		hasTimestamp &&
		typeof comment.timestampEnd === "number" &&
		comment.timestampEnd > (comment.timestamp as number)
	const hasPage = typeof comment.page === "number"
	const hasModelPin = !!comment.modelAnchor

	const annotationCount = Array.isArray(comment.annotation)
		? comment.annotation.length
		: comment.annotation
		? 1
		: 0

	const isSelectable =
		!!comment.annotation || hasTimestamp || hasPage || hasModelPin
	const handleSelect = () => {
		onSelectComment?.(comment)
	}
	const handleCardKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault()
			handleSelect()
		}
	}

	const submitReply = async () => {
		if (!replyContent.trim() || isSubmittingReply) return

		setIsSubmittingReply(true)
		try {
			await api.post(
				`/api/images/versions/${comment.imageVersionId}/comments`,
				{
					content: replyContent,
					parentId: comment.id,
					mentionedUserIds: mentionIdsIn(replyContent),
				}
			)
			setReplyContent("")
			resetMentions()
			setIsReplying(false)
			onCommentUpdate?.()
		} catch (error) {
			toast.error(describeError(error, "Could not post your reply."))
		} finally {
			setIsSubmittingReply(false)
		}
	}

	return (
		<div
			className={cn(
				"flex flex-col gap-3 w-full rounded-lg",
				isSelectable &&
					"cursor-pointer p-2 -m-0 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isSelected && "bg-accent/60"
			)}
			onClick={isSelectable ? handleSelect : undefined}
			onKeyDown={isSelectable ? handleCardKeyDown : undefined}
			role={isSelectable ? "button" : undefined}
			tabIndex={isSelectable ? 0 : undefined}
			aria-pressed={isSelectable ? isSelected : undefined}
			aria-label={
				isSelectable
					? `Comment by ${comment.user.name || comment.user.email}. ${
							isSelected
								? "Selected — select again to hide its drawing."
								: `Select to pin its drawing${
										hasTimestamp ? " and jump to its moment in the video" : ""
								  }${hasPage ? " and jump to its page" : ""}${
										hasModelPin ? " and fly the camera to its pin" : ""
								  }.`
					  }`
					: undefined
			}
		>
			<div className="flex items-start gap-3 w-full">
				<Avatar className="h-8 w-8 flex-shrink-0">
					<AvatarFallback className="text-xs">
						{(comment.user.name?.charAt(0) || comment.user.email.charAt(0)).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<p className="truncate text-sm font-medium leading-tight">
								{comment.user.name || comment.user.email}
							</p>
							<p className="text-xs text-muted-foreground">{timestamp}</p>
						</div>
						{isAuthor && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 flex-shrink-0 text-muted-foreground"
										aria-label="Comment actions"
										onClick={(e) => e.stopPropagation()}
									>
										<MoreHorizontal className="h-4 w-4" />
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
										onClick={(e) => {
											e.stopPropagation()
											handleDelete()
										}}
										disabled={isDeleting}
									>
										<Trash2 className="mr-2 h-3.5 w-3.5" />
										{isDeleting ? "Deleting..." : "Delete comment"}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>

					{(hasTimestamp ||
						hasPage ||
						hasModelPin ||
						comment.resolved ||
						annotationCount > 0) && (
						<div className="mt-2 flex flex-wrap items-center gap-1.5">
							{hasTimestamp && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation()
										onSeek?.(comment.timestamp as number)
									}}
									className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label={
										hasRange
											? `Jump to the range from ${formatVideoTime(
													comment.timestamp as number
											  )} to ${formatVideoTime(
													comment.timestampEnd as number
											  )} in the video`
											: `Jump to ${formatVideoTime(
													comment.timestamp as number
											  )} in the video`
									}
								>
									<Clock className="h-3 w-3" aria-hidden="true" />
									{hasRange
										? `${formatVideoTime(
												comment.timestamp as number
										  )} → ${formatVideoTime(comment.timestampEnd as number)}`
										: formatVideoTime(comment.timestamp as number)}
								</button>
							)}
							{hasPage && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation()
										onGoToPage?.(comment.page as number)
									}}
									className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label={`Go to page ${comment.page} in the document`}
								>
									<FileText className="h-3 w-3" aria-hidden="true" />
									Page {comment.page}
								</button>
							)}
							{hasModelPin && (
								<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
									<MapPin className="h-3 w-3" aria-hidden="true" />
									3D pin
								</span>
							)}
							{comment.resolved && (
								<span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
									<CheckCircle2 className="h-3 w-3" aria-hidden="true" />
									Resolved
								</span>
							)}
							{annotationCount > 0 && (
								<span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
									<Edit3 className="h-3 w-3" aria-hidden="true" />
									{annotationCount > 1
										? `${annotationCount} drawings`
										: "Drawing"}
								</span>
							)}
						</div>
					)}

					<p
						className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap"
						style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
					>
						{renderWithMentions(comment.content, comment.mentions)}
					</p>
					<div className="mt-2 flex items-center gap-3">
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
							aria-pressed={isLiked}
							aria-label={isLiked ? "Unlike comment" : "Like comment"}
						>
							<ThumbsUp
								className={cn("h-3.5 w-3.5", isLiked && "fill-primary")}
								aria-hidden="true"
							/>
							{likeCount > 0 && likeCount} Like{likeCount !== 1 && "s"}
						</Button>
						{canReply && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
								onClick={(e) => {
									e.stopPropagation()
									setIsReplying(!isReplying)
								}}
								aria-expanded={isReplying}
							>
								<MessageSquareReply className="h-3.5 w-3.5" aria-hidden="true" />
								Reply
							</Button>
						)}
					</div>

					{isReplying && canReply && (
						<div
							className="mt-2 flex flex-col gap-2"
							onClick={(e) => e.stopPropagation()}
						>
							<MentionTextarea
								id={`reply-input-${comment.id}`}
								ariaLabel="Write a reply"
								placeholder="Write a reply... Use @ to mention a teammate"
								className="min-h-[60px] text-xs"
								value={replyContent}
								onChange={setReplyContent}
								onMentionPicked={addMention}
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
							onSelectComment={onSelectComment}
							onSeek={onSeek}
							onGoToPage={onGoToPage}
							canReply={canReply}
						/>
					))}
				</div>
			)}
		</div>
	)
}
