"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Loader2 } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"

interface CommentRevision {
	id: string
	content: string
	createdAt: string
}

interface CommentHistoryDialogProps {
	commentId: string
	currentContent: string
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function CommentHistoryDialog({
	commentId,
	currentContent,
	open,
	onOpenChange,
}: CommentHistoryDialogProps) {
	const [revisions, setRevisions] = useState<CommentRevision[] | null>(null)
	const [error, setError] = useState("")

	useEffect(() => {
		if (!open) return
		let cancelled = false
		setRevisions(null)
		setError("")
		api
			.get<CommentRevision[]>(`/api/images/comments/${commentId}/revisions`)
			.then((loaded) => {
				if (!cancelled) setRevisions(loaded)
			})
			.catch((caught) => {
				if (!cancelled) setError(describeError(caught, "Could not load the edit history."))
			})
		return () => {
			cancelled = true
		}
	}, [open, commentId])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit history</DialogTitle>
					<DialogDescription>
						Earlier wording of this comment, newest first.
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-80 space-y-3 overflow-y-auto">
					<div className="rounded-md border border-primary/40 p-3">
						<p className="mb-1 text-xs font-medium text-primary">Current</p>
						<p className="whitespace-pre-wrap text-sm">{currentContent}</p>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					{!revisions && !error && (
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading edit history" />
					)}
					{revisions?.map((revision) => (
						<div key={revision.id} className="rounded-md border border-border p-3">
							<p className="mb-1 text-xs text-muted-foreground">
								Replaced {format(new Date(revision.createdAt), "PPpp")}
							</p>
							<p className="whitespace-pre-wrap text-sm">{revision.content}</p>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	)
}
