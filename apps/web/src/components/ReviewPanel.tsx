"use client"

import { useCallback, useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/UserAvatar"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { Review, ReviewDecisionValue, ReviewStatus, User } from "@/types"

interface ReviewPanelProps {
	imageVersionId: string
	canDecide: boolean
	currentUser: User | null
	onStatusChange?: (status: ReviewStatus) => void
}

interface ReviewSummary {
	reviewStatus: ReviewStatus
	dueAt: string | null
	reviews: Review[]
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
	PENDING: "Awaiting review",
	CHANGES_REQUESTED: "Changes requested",
	APPROVED: "Approved",
}

const STATUS_STYLES: Record<ReviewStatus, string> = {
	PENDING: "bg-muted text-muted-foreground",
	CHANGES_REQUESTED:
		"bg-destructive/10 text-destructive border border-destructive/20",
	APPROVED:
		"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
}

const STATUS_ICONS: Record<ReviewStatus, typeof Clock> = {
	PENDING: Clock,
	CHANGES_REQUESTED: XCircle,
	APPROVED: CheckCircle2,
}

export function ReviewStatusBadge({
	status,
	className,
}: {
	status: ReviewStatus
	className?: string
}) {
	const Icon = STATUS_ICONS[status]
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
				STATUS_STYLES[status],
				className
			)}
		>
			<Icon className="h-3.5 w-3.5" aria-hidden="true" />
			{REVIEW_STATUS_LABELS[status]}
		</span>
	)
}

export function ReviewPanel({
	imageVersionId,
	canDecide,
	currentUser,
	onStatusChange,
}: ReviewPanelProps) {
	const [summary, setSummary] = useState<ReviewSummary | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [note, setNote] = useState("")
	const [pendingDecision, setPendingDecision] =
		useState<ReviewDecisionValue | null>(null)

	const load = useCallback(async () => {
		setIsLoading(true)
		try {
			const result = await api.get<ReviewSummary>(
				`/api/images/versions/${imageVersionId}/reviews`
			)
			setSummary(result)
			onStatusChange?.(result.reviewStatus)
		} catch {
			setSummary(null)
		} finally {
			setIsLoading(false)
		}
	}, [imageVersionId, onStatusChange])

	useEffect(() => {
		void load()
	}, [load])

	const myReview = summary?.reviews.find(
		(review) => review.user.id === currentUser?.id
	)

	const decide = async (decision: ReviewDecisionValue) => {
		setPendingDecision(decision)
		try {
			await api.post(`/api/images/versions/${imageVersionId}/reviews`, {
				decision,
				note: note.trim() || null,
			})
			setNote("")
			toast.success(
				decision === "APPROVED"
					? "Marked as approved."
					: "Changes requested — the team has been notified."
			)
			await load()
		} catch (error) {
			toast.error(describeError(error, "Could not record your decision."))
		} finally {
			setPendingDecision(null)
		}
	}

	const withdraw = async () => {
		setPendingDecision("APPROVED")
		try {
			await api.delete(`/api/images/versions/${imageVersionId}/reviews`)
			toast.success("Your review was withdrawn.")
			await load()
		} catch (error) {
			toast.error(describeError(error, "Could not withdraw your review."))
		} finally {
			setPendingDecision(null)
		}
	}

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
				Loading review status…
			</div>
		)
	}

	if (!summary) return null

	return (
		<section
			className="flex flex-col gap-3 border-b border-border/40 p-4"
			aria-label="Review status"
		>
			<div className="flex items-center justify-between gap-2">
				<ReviewStatusBadge status={summary.reviewStatus} />
				{summary.dueAt && (
					<span className="text-xs text-muted-foreground">
						Due {formatDistanceToNow(new Date(summary.dueAt), { addSuffix: true })}
					</span>
				)}
			</div>

			{summary.reviews.length > 0 && (
				<ul className="flex flex-col gap-2">
					{summary.reviews.map((review) => (
						<li key={review.id} className="flex items-start gap-2 text-sm">
							<UserAvatar
								className="h-6 w-6 flex-shrink-0"
								fallbackClassName="text-[10px]"
								name={review.user.name}
								email={review.user.email}
								avatarUrl={review.user.avatarUrl}
							/>
							<div className="min-w-0 flex-1">
								<p className="text-xs">
									<span className="font-medium">
										{review.user.name || review.user.email}
									</span>{" "}
									<span className="text-muted-foreground">
										{review.decision === "APPROVED"
											? "approved"
											: "requested changes"}{" "}
										{formatDistanceToNow(new Date(review.updatedAt), {
											addSuffix: true,
										})}
									</span>
								</p>
								{review.note && (
									<p className="mt-0.5 text-xs text-muted-foreground">
										{review.note}
									</p>
								)}
							</div>
						</li>
					))}
				</ul>
			)}

			{canDecide && (
				<div className="flex flex-col gap-2">
					<label htmlFor="review-note" className="sr-only">
						Review note
					</label>
					<Textarea
						id="review-note"
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="Add an optional note for the team…"
						rows={2}
						className="resize-none text-sm"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							onClick={() => decide("APPROVED")}
							disabled={pendingDecision !== null}
						>
							<CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
							Approve
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => decide("CHANGES_REQUESTED")}
							disabled={pendingDecision !== null}
						>
							<XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
							Request changes
						</Button>
						{myReview && (
							<Button
								size="sm"
								variant="ghost"
								onClick={withdraw}
								disabled={pendingDecision !== null}
							>
								<RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
								Withdraw mine
							</Button>
						)}
					</div>
				</div>
			)}
		</section>
	)
}
