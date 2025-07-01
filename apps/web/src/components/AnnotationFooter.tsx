"use client"

import { useState } from "react"
import { Globe, Paperclip, Mic, Send, Undo, Redo, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnnotationToolbar } from "./AnnotationToolbar"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { Annotation } from "@/types"

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
}: AnnotationFooterProps) {
	const [comment, setComment] = useState("")
	const [isSending, setIsSending] = useState(false)
	const { user } = useAuth()

	const handleSendComment = async () => {
		if (!comment.trim()) return

		setIsSending(true)
		try {
			// Send all annotations with the comment, not just the current one
			const annotationsToSend =
				annotations.length > 0
					? annotations
					: currentAnnotation
					? [currentAnnotation]
					: undefined

			const res = await fetch(
				`http://localhost:3001/api/images/versions/${imageVersionId}/comments`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						content: comment,
						annotation: annotationsToSend,
					}),
				}
			)

			if (res.ok) {
				setComment("")
				// Clear the current annotation after submitting
				onClear()
				// Notify parent that comment was added to refresh comments
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
			{/* Top row with comment input */}
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
					<Textarea
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
					>
						{isSending ? (
							<span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
						) : (
							<Send className="h-4 w-4" />
						)}
					</Button>
				</div>
			</div>

			{/* Bottom row with tools */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1">
					{annotations.length > 0 && (
						<div className="text-xs text-muted-foreground">
							{annotations.length} drawing{annotations.length > 1 ? "s" : ""}
						</div>
					)}
				</div>
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
						>
							<Undo className="h-4 w-4" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							onClick={onRedo}
							disabled={!canRedo}
							className={cn("h-7 w-7 rounded-sm", !canRedo && "opacity-40")}
						>
							<Redo className="h-4 w-4" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							onClick={onClear}
							className="h-7 w-7 rounded-sm text-destructive hover:text-destructive/90"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
