"use client"

import { useState } from "react"
import {
	Check,
	ChevronDown,
	Clock,
	FileText,
	ListChecks,
	Loader2,
	MapPin,
	RotateCcw,
	X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useVideoTimeFormatter } from "@/context/VideoTimingContext"
import { RevisionCheckItem, RevisionCheckStatus, RevisionChecklist } from "@/types"

interface RevisionCheckPanelProps {
	checklist: RevisionChecklist
	currentUserId: string | null
	canCheck: boolean
	canModerate: boolean
	focusedId: string | null
	pendingId: string | null
	onFocus: (item: RevisionCheckItem) => void
	onSetStatus: (item: RevisionCheckItem, status: RevisionCheckStatus | null) => void
}

const personName = (person: { name: string | null; email: string }) =>
	person.name || person.email

export const mayConfirmFix = (
	item: RevisionCheckItem,
	currentUserId: string | null,
	canModerate: boolean
): boolean => canModerate || item.author.id === currentUserId

export const mayUndoCheck = (
	item: RevisionCheckItem,
	currentUserId: string | null,
	canModerate: boolean
): boolean =>
	!!item.check && (canModerate || (!!item.check.checkedBy && item.check.checkedBy.id === currentUserId))

function AnchorChip({ item }: { item: RevisionCheckItem }) {
	const formatTime = useVideoTimeFormatter()
	if (typeof item.timestamp === "number") {
		return (
			<span className="inline-flex items-center gap-1 text-[11px] text-primary">
				<Clock className="h-3 w-3" aria-hidden="true" />
				{formatTime(item.timestamp)}
			</span>
		)
	}
	if (typeof item.page === "number") {
		return (
			<span className="inline-flex items-center gap-1 text-[11px] text-primary">
				<FileText className="h-3 w-3" aria-hidden="true" />
				Page {item.page}
			</span>
		)
	}
	if (item.modelAnchor) {
		return (
			<span className="inline-flex items-center gap-1 text-[11px] text-primary">
				<MapPin className="h-3 w-3" aria-hidden="true" />
				Pinned spot
			</span>
		)
	}
	return null
}

function StatusBadge({ item }: { item: RevisionCheckItem }) {
	if (item.check?.status === "FIXED") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
				<Check className="h-3 w-3" aria-hidden="true" />
				Fixed
			</span>
		)
	}
	if (item.check?.status === "NOT_FIXED") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
				<X className="h-3 w-3" aria-hidden="true" />
				Still open
			</span>
		)
	}
	return (
		<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
			To check
		</span>
	)
}

export function RevisionCheckPanel({
	checklist,
	currentUserId,
	canCheck,
	canModerate,
	focusedId,
	pendingId,
	onFocus,
	onSetStatus,
}: RevisionCheckPanelProps) {
	const [isOpen, setIsOpen] = useState(checklist.summary.unchecked > 0)
	const { summary } = checklist

	if (summary.total === 0) return null

	return (
		<section aria-label="Revision check" className="border-b border-border/40">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
			>
				<ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
				<span className="flex-1 text-sm font-medium">Revision check</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{summary.fixed}/{summary.total} fixed
					{summary.notFixed > 0 && ` · ${summary.notFixed} still open`}
				</span>
				<ChevronDown
					className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")}
					aria-hidden="true"
				/>
			</button>
			<div
				className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-label="Earlier feedback confirmed fixed"
				aria-valuemin={0}
				aria-valuemax={summary.total}
				aria-valuenow={summary.fixed}
			>
				<div
					className="h-full bg-primary transition-all"
					style={{ width: `${(summary.fixed / summary.total) * 100}%` }}
				/>
			</div>
			{isOpen && (
				<ul className="space-y-1 px-2 pb-3">
					{checklist.truncated && (
						<li className="px-2 text-[11px] text-muted-foreground">
							Showing the oldest {checklist.items.length} items.
						</li>
					)}
					{checklist.items.map((item) => {
						const isPending = pendingId === item.commentId
						const isFocused = focusedId === item.commentId
						const canFix = canCheck && mayConfirmFix(item, currentUserId, canModerate)
						return (
							<li
								key={item.commentId}
								className={cn(
									"rounded-md border p-2",
									isFocused ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted/40"
								)}
							>
								<button
									type="button"
									onClick={() => onFocus(item)}
									className="block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-pressed={isFocused}
								>
									<span className="sr-only">Show feedback from {item.fromVersion.versionName}: </span>
									<span className="flex items-center gap-1.5">
										<span className="rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
											V{item.fromVersion.versionNumber}
										</span>
										<span className="truncate text-xs font-medium">{personName(item.author)}</span>
										<span className="ml-auto">
											<StatusBadge item={item} />
										</span>
									</span>
									<span className="mt-1 line-clamp-2 block text-xs text-foreground/90">{item.content}</span>
									<span className="mt-1 flex flex-wrap items-center gap-2">
										<AnchorChip item={item} />
										{item.stillOpenOn && !item.check && (
											<span className="text-[11px] text-destructive">
												Still open on {item.stillOpenOn.versionName}
											</span>
										)}
									</span>
								</button>
								{canCheck && (
									<div className="mt-2 flex flex-wrap items-center gap-1.5">
										{isPending ? (
											<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />
										) : item.check ? (
											mayUndoCheck(item, currentUserId, canModerate) && (
												<Button
													size="sm"
													variant="ghost"
													className="h-7 gap-1 px-2 text-[11px] pointer-coarse:h-9"
													onClick={() => onSetStatus(item, null)}
												>
													<RotateCcw className="h-3 w-3" aria-hidden="true" />
													Undo
												</Button>
											)
										) : (
											<>
												{canFix && (
													<Button
														size="sm"
														variant="outline"
														className="h-7 gap-1 px-2 text-[11px] pointer-coarse:h-9"
														onClick={() => onSetStatus(item, "FIXED")}
													>
														<Check className="h-3 w-3" aria-hidden="true" />
														Fixed
													</Button>
												)}
												<Button
													size="sm"
													variant="outline"
													className="h-7 gap-1 px-2 text-[11px] pointer-coarse:h-9"
													onClick={() => onSetStatus(item, "NOT_FIXED")}
												>
													<X className="h-3 w-3" aria-hidden="true" />
													Still open
												</Button>
												{!canFix && (
													<span className="text-[11px] text-muted-foreground">
														{personName(item.author)} or an editor confirms the fix
													</span>
												)}
											</>
										)}
									</div>
								)}
							</li>
						)
					})}
				</ul>
			)}
		</section>
	)
}
