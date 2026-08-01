"use client"

import { useRef, useState } from "react"
import {
	Send,
	Undo,
	Redo,
	Trash2,
	X,
	FileText,
	MapPin,
	Lock,
	Paperclip,
} from "lucide-react"

const MAX_ATTACHMENTS = 3
import { Button } from "@/components/ui/button"
import { MentionTextarea } from "@/components/MentionTextarea"
import { useMentionDraft } from "@/hooks/useMentionDraft"
import { AnnotationToolbar } from "./AnnotationToolbar"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
import { cn, formatVideoTime } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { Annotation, ModelAnchor } from "@/types"
import { Clock } from "lucide-react"
import { UserAvatar } from "@/components/UserAvatar"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

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
	canPostInternal?: boolean
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
	canPostInternal = false,
}: AnnotationFooterProps) {
	const [comment, setComment] = useState("")
	const [isInternal, setIsInternal] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const [pendingFiles, setPendingFiles] = useState<File[]>([])
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { user } = useAuth()
	const { addMention, mentionIdsIn, resetMentions } = useMentionDraft()

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

			const created = await api.post<{ id: string }>(
				`/api/images/versions/${imageVersionId}/comments`,
				{
					content: comment,
					annotation: annotationsToSend,
					mentionedUserIds: mentionIdsIn(comment),
					...(isInternal ? { internal: true } : {}),
					...(typeof anchorStart === "number" ? { timestamp: anchorStart } : {}),
					...(hasRange ? { timestampEnd: anchorEnd } : {}),
					...(typeof page === "number" ? { page } : {}),
					...(modelAnchor ? { modelAnchor } : {}),
				}
			)

			if (pendingFiles.length > 0 && created?.id) {
				const attachments = new FormData()
				pendingFiles.forEach((file) => attachments.append("files", file))
				try {
					await api.post(
						`/api/images/comments/${created.id}/attachments`,
						attachments
					)
				} catch (error) {
					toast.error(
						describeError(error, "Your comment posted, but the files did not.")
					)
				}
			}

			setComment("")
			setPendingFiles([])
			resetMentions()
			onClear()
			onClearRange?.()
			onCommentAdded()
		} catch (error) {
			toast.error(describeError(error, "Could not post your comment."))
		} finally {
			setIsSending(false)
		}
	}

	return (
		<div className="space-y-3 border-t border-border/40 bg-card p-4">
			<div className="flex items-start gap-2">
				<UserAvatar
					className="h-8 w-8 flex-shrink-0"
					name={user?.name}
					email={user?.email}
					avatarUrl={user?.avatarUrl}
				/>
				<div className="relative flex-1">
					<label htmlFor="comment-input" className="sr-only">
						Add a comment
					</label>
					<MentionTextarea
						id="comment-input"
						placeholder="Add a comment... Use @ to mention a teammate"
						value={comment}
						onChange={setComment}
						onMentionPicked={addMention}
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

			{pendingFiles.length > 0 && (
				<ul className="flex flex-wrap gap-1.5 pl-10">
					{pendingFiles.map((file, index) => (
						<li
							key={`${file.name}-${index}`}
							className="flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground"
						>
							<Paperclip className="h-3 w-3" aria-hidden="true" />
							<span className="max-w-[140px] truncate">{file.name}</span>
							<button
								className="rounded-full text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() =>
									setPendingFiles((files) =>
										files.filter((_, i) => i !== index)
									)
								}
								aria-label={`Remove ${file.name}`}
							>
								<X className="h-3 w-3" aria-hidden="true" />
							</button>
						</li>
					))}
				</ul>
			)}

			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<input
						ref={fileInputRef}
						type="file"
						multiple
						accept="image/*,application/pdf"
						className="sr-only"
						onChange={(e) => {
							const chosen = Array.from(e.target.files ?? [])
							setPendingFiles((files) =>
								[...files, ...chosen].slice(0, MAX_ATTACHMENTS)
							)
							e.target.value = ""
						}}
					/>
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6 text-muted-foreground hover:text-foreground"
						onClick={() => fileInputRef.current?.click()}
						disabled={pendingFiles.length >= MAX_ATTACHMENTS}
						aria-label="Attach a reference image or PDF"
					>
						<Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
					</Button>
					{canPostInternal && (
						<Button
							variant={isInternal ? "default" : "outline"}
							size="sm"
							className="h-6 gap-1 px-2 text-[11px]"
							onClick={() => setIsInternal(!isInternal)}
							aria-pressed={isInternal}
							aria-label="Post as an internal note, hidden from viewers and reviewers"
						>
							<Lock className="h-3 w-3" aria-hidden="true" />
							{isInternal ? "Internal note" : "Internal"}
						</Button>
					)}
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
