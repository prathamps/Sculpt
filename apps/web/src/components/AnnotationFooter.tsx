"use client"

import { useState } from "react"
import { Send, Undo, Redo, Trash2, X, FileText, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnnotationToolbar } from "./AnnotationToolbar"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
import { cn, formatVideoTime } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { Annotation, ModelAnchor } from "@/types"
import { Clock } from "lucide-react"

export interface ComposeRange {
	start: number | null
	end: number | null
}

interface AnnotationFooterProps {
	tool: AnnotationTool
	setTool: (tool: AnnotationTool) => void
	color: string
	setColor: (color: string) => void
	onUndo: () => void
	onRedo: () => void
	onClear: () => void
	canUndo: boolean
	canRedo: boolean
	currentAnnotation?: Annotation | null
	annotations: Annotation[]
	imageVersionId: string
	onCommentAdded: () => void
	timestamp?: number | null
	composeRange?: ComposeRange
	onMarkIn?: () => void
	onMarkOut?: () => void
	onClearRange?: () => void
	page?: number | null
	modelAnchor?: ModelAnchor | null
	onClearModelAnchor?: () => void
}

export function AnnotationFooter({
	tool,
	setTool,
	color,
	setColor,
	onUndo,
	onRedo,
	onClear,
	canUndo,
	canRedo,
	currentAnnotation,
	annotations,
	imageVersionId,
	onCommentAdded,
	timestamp: livePlayheadSeconds,
	composeRange,
	onMarkIn,
	onMarkOut,
	onClearRange,
	page,
	modelAnchor,
	onClearModelAnchor,
}: AnnotationFooterProps) {
	const [comment, setComment] = useState("")
	const [isSending, setIsSending] = useState(false)
	const { user } = useAuth()
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

	const isVideoContext = typeof livePlayheadSeconds === "number"
	const isModelContext = modelAnchor !== undefined
	const anchorStart = composeRange?.start ?? livePlayheadSeconds ?? null
	const anchorEnd = composeRange?.end ?? null
	const hasRange =
		typeof anchorStart === "number" &&
		typeof anchorEnd === "number" &&
		anchorEnd >= anchorStart

	const handleSendComment = async () => {
		if (!comment.trim()) return

		setIsSending(true)
		try {
			const annotationsToSend =
				annotations.length > 0
					? annotations
					: currentAnnotation
					? [currentAnnotation]
					: undefined

			const res = await fetch(
				`${URI}/api/images/versions/${imageVersionId}/comments`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						content: comment,
						annotation: annotationsToSend,
						...(typeof anchorStart === "number"
							? { timestamp: anchorStart }
							: {}),
						...(hasRange ? { timestampEnd: anchorEnd } : {}),
						...(typeof page === "number" ? { page } : {}),
						...(modelAnchor ? { modelAnchor } : {}),
					}),
				}
			)

			if (res.ok) {
				setComment("")
				onClear()
				onClearRange?.()
				onCommentAdded()
			}
		} catch (error) {
			console.error("Failed to send comment:", error)
		} finally {
			setIsSending(false)
		}
	}

	return (
		<div className="space-y-3 border-t border-border/40 bg-card p-4">
			<div className="flex items-start gap-2">
				<Avatar className="h-8 w-8 flex-shrink-0">
					<AvatarImage
						src={`https://api.dicebear.com/7.x/micah/svg?seed=${
							user?.email || "user"
						}`}
						alt={user?.name || "User"}
					/>
					<AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
				</Avatar>
				<div className="relative flex-1">
					<label htmlFor="comment-input" className="sr-only">
						Add a comment
					</label>
					<Textarea
						id="comment-input"
						placeholder="Add a comment..."
						value={comment}
						onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
							setComment(e.target.value)
						}
						className="min-h-[40px] resize-none rounded-md border-border/50 bg-background/60 pr-10 text-sm focus-visible:ring-1 focus-visible:ring-ring"
					/>
					<Button
						size="icon"
						className="absolute bottom-1 right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
						onClick={handleSendComment}
						disabled={!comment.trim() || isSending}
						aria-label="Send comment"
					>
						{isSending ? (
							<span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
						) : (
							<Send className="h-4 w-4" aria-hidden="true" />
						)}
					</Button>
				</div>
			</div>

			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{annotations.length > 0 && (
						<div className="text-xs text-muted-foreground">
							{annotations.length} drawing{annotations.length > 1 ? "s" : ""}
						</div>
					)}
					{isVideoContext && (
						<div className="flex flex-wrap items-center gap-1.5">
							<div className="flex items-center gap-1 text-xs text-primary">
								<Clock className="h-3 w-3" aria-hidden="true" />
								{hasRange
									? `${formatVideoTime(anchorStart as number)} → ${formatVideoTime(
											anchorEnd as number
									  )}`
									: `at ${formatVideoTime(anchorStart ?? 0, true)}`}
							</div>
							<Button
								variant="outline"
								size="sm"
								className="h-6 px-2 text-[11px]"
								onClick={onMarkIn}
								aria-label="Set comment start to the current time"
							>
								Mark in
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-6 px-2 text-[11px]"
								onClick={onMarkOut}
								aria-label="Set comment end to the current time"
							>
								Mark out
							</Button>
							{(composeRange?.start != null || composeRange?.end != null) && (
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6 text-muted-foreground hover:text-destructive"
									onClick={onClearRange}
									aria-label="Clear the marked comment range"
								>
									<X className="h-3 w-3" aria-hidden="true" />
								</Button>
							)}
						</div>
					)}
					{typeof page === "number" && (
						<div className="flex items-center gap-1 text-xs text-primary">
							<FileText className="h-3 w-3" aria-hidden="true" />
							Page {page}
						</div>
					)}
					{isModelContext &&
						(modelAnchor ? (
							<div className="flex items-center gap-1.5 text-xs text-primary">
								<MapPin className="h-3 w-3" aria-hidden="true" />
								Pin placed on model
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6 text-muted-foreground hover:text-destructive"
									onClick={onClearModelAnchor}
									aria-label="Remove the placed pin"
								>
									<X className="h-3 w-3" aria-hidden="true" />
								</Button>
							</div>
						) : (
							<div className="text-xs text-muted-foreground">
								Click the model to pin this comment to a spot
							</div>
						))}
				</div>
				{!isModelContext && (
				<div className="flex items-center gap-2">
					<AnnotationToolbar
						tool={tool}
						setTool={setTool}
						color={color}
						setColor={setColor}
					/>
					<div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-background/60 p-0.5">
						<Button
							size="icon"
							variant="ghost"
							onClick={onUndo}
							disabled={!canUndo}
							className={cn("h-7 w-7 rounded-sm", !canUndo && "opacity-40")}
							aria-label="Undo"
						>
							<Undo className="h-4 w-4" aria-hidden="true" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							onClick={onRedo}
							disabled={!canRedo}
							className={cn("h-7 w-7 rounded-sm", !canRedo && "opacity-40")}
							aria-label="Redo"
						>
							<Redo className="h-4 w-4" aria-hidden="true" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							onClick={onClear}
							className="h-7 w-7 rounded-sm text-destructive hover:text-destructive/90"
							aria-label="Clear all drawings"
						>
							<Trash2 className="h-4 w-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
				)}
			</div>
		</div>
	)
}
