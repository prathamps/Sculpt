"use client"
import { useState } from "react"
import { CommentCard } from "./CommentCard"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Filter, Search, MessageSquare, Loader2 } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioItem,
	DropdownMenuRadioGroup,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Comment } from "@/types"

type CommentFilter = "all" | "unresolved" | "resolved"

interface CommentSidebarProps {
	comments: Comment[]
	isLoading?: boolean
	onRefresh?: () => void
	selectedCommentId?: string | null
	onSelectComment?: (comment: Comment) => void
	onSeek?: (t: number) => void
	onGoToPage?: (page: number) => void
	currentPage?: number | null
	className?: string
	canReply?: boolean
}

// Presentational comment list. Data ownership (fetching + socket updates)
// lives in useVersionComments at the page level so scrubber markers keep
// working when this sidebar is closed.
export function CommentSidebar({
	comments,
	isLoading = false,
	onRefresh,
	selectedCommentId,
	onSelectComment,
	onSeek,
	onGoToPage,
	currentPage,
	className,
	canReply = true,
}: CommentSidebarProps) {
	const [searchQuery, setSearchQuery] = useState("")
	const [filter, setFilter] = useState<CommentFilter>("all")
	const [thisPageOnly, setThisPageOnly] = useState(false)

	// Apply filters
	const filteredComments = comments.filter((comment) => {
		const matchesSearch = comment.content
			.toLowerCase()
			.includes(searchQuery.toLowerCase())
		const matchesFilter =
			filter === "all" ||
			(filter === "resolved" && comment.resolved) ||
			(filter === "unresolved" && !comment.resolved)
		const matchesPage =
			!thisPageOnly ||
			typeof currentPage !== "number" ||
			comment.page === currentPage
		return matchesSearch && matchesFilter && matchesPage
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
			<div className="flex flex-wrap items-center gap-2 border-b border-border/40 p-3">
				<div className="relative min-w-[8rem] flex-1">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-8 pl-8"
						placeholder="Search comments..."
						aria-label="Search comments"
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
				{typeof currentPage === "number" && (
					<Button
						variant={thisPageOnly ? "default" : "outline"}
						size="sm"
						className="h-8 text-xs"
						onClick={() => setThisPageOnly((v) => !v)}
						aria-pressed={thisPageOnly}
					>
						{thisPageOnly ? "This page" : "All pages"}
					</Button>
				)}
			</div>
			<div
				className="flex-1 overflow-y-auto p-3 custom-scrollbar"
				style={{
					scrollbarWidth: "thin",
					scrollbarColor: "rgba(155, 155, 155, 0.5) transparent",
				}}
			>
				{comments.length > 0 ? (
					<div className="w-full divide-y divide-border/40">
						{filteredComments.length > 0 ? (
							filteredComments.map((comment) => (
								<div key={comment.id} className="py-3 first:pt-0 last:pb-0">
									<CommentCard
										comment={comment}
										onCommentUpdate={onRefresh}
										onSelectComment={onSelectComment}
										isSelected={comment.id === selectedCommentId}
										onSeek={onSeek}
										onGoToPage={onGoToPage}
										canReply={canReply}
									/>
								</div>
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
