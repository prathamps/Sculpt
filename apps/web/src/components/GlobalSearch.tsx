"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
	BoxIcon,
	FileTextIcon,
	FolderIcon,
	ImageIcon,
	Loader2,
	MessageSquare,
	PlayIcon,
	Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const SEARCH_DEBOUNCE_MS = 250
const MINIMUM_QUERY_LENGTH = 2

interface SearchHit {
	id: string
	label: string
	projectId: string
	projectName: string
}

interface MediaHit extends SearchHit {
	mediaType: "IMAGE" | "VIDEO" | "PDF" | "MODEL"
}

interface CommentHit extends SearchHit {
	imageId: string
	authorName: string | null
}

interface SearchResults {
	projects: SearchHit[]
	media: MediaHit[]
	comments: CommentHit[]
}

const MEDIA_ICONS = {
	IMAGE: ImageIcon,
	VIDEO: PlayIcon,
	PDF: FileTextIcon,
	MODEL: BoxIcon,
}

const EMPTY_RESULTS: SearchResults = { projects: [], media: [], comments: [] }

type MediaTypeFilter = "ALL" | "IMAGE" | "VIDEO" | "PDF" | "MODEL"
type ReviewStatusFilter = "ALL" | "PENDING" | "CHANGES_REQUESTED" | "APPROVED"

const MEDIA_TYPE_FILTERS: { value: MediaTypeFilter; label: string }[] = [
	{ value: "ALL", label: "Any type" },
	{ value: "IMAGE", label: "Images" },
	{ value: "VIDEO", label: "Video" },
	{ value: "PDF", label: "PDFs" },
	{ value: "MODEL", label: "3D models" },
]

const REVIEW_STATUS_FILTERS: { value: ReviewStatusFilter; label: string }[] = [
	{ value: "ALL", label: "Any status" },
	{ value: "PENDING", label: "Pending review" },
	{ value: "CHANGES_REQUESTED", label: "Changes requested" },
	{ value: "APPROVED", label: "Approved" },
]

const totalHits = (results: SearchResults): number =>
	results.projects.length + results.media.length + results.comments.length

export function GlobalSearch() {
	const router = useRouter()
	const [isOpen, setIsOpen] = useState(false)
	const [query, setQuery] = useState("")
	const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
	const [isSearching, setIsSearching] = useState(false)
	const [mediaType, setMediaType] = useState<MediaTypeFilter>("ALL")
	const [reviewStatus, setReviewStatus] = useState<ReviewStatusFilter>("ALL")
	const abortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "k") {
				event.preventDefault()
				setIsOpen(true)
			}
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [])

	const runSearch = useCallback(
		async (
			term: string,
			filters: { mediaType: MediaTypeFilter; reviewStatus: ReviewStatusFilter }
		) => {
			abortRef.current?.abort()

			if (term.trim().length < MINIMUM_QUERY_LENGTH) {
				setResults(EMPTY_RESULTS)
				setIsSearching(false)
				return
			}

			const controller = new AbortController()
			abortRef.current = controller
			setIsSearching(true)

			const params = new URLSearchParams({ q: term.trim() })
			if (filters.mediaType !== "ALL") params.set("mediaType", filters.mediaType)
			if (filters.reviewStatus !== "ALL") {
				params.set("reviewStatus", filters.reviewStatus)
			}

			try {
				setResults(
					await api.get<SearchResults>(`/api/search?${params}`, {
						signal: controller.signal,
					})
				)
			} catch {
				if (!controller.signal.aborted) setResults(EMPTY_RESULTS)
			} finally {
				if (!controller.signal.aborted) setIsSearching(false)
			}
		},
		[]
	)

	useEffect(() => {
		const timer = setTimeout(
			() => void runSearch(query, { mediaType, reviewStatus }),
			SEARCH_DEBOUNCE_MS
		)
		return () => clearTimeout(timer)
	}, [query, mediaType, reviewStatus, runSearch])

	const goTo = (href: string) => {
		setIsOpen(false)
		setQuery("")
		setResults(EMPTY_RESULTS)
		router.push(href)
	}

	const hasQuery = query.trim().length >= MINIMUM_QUERY_LENGTH

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="gap-2 text-muted-foreground"
				onClick={() => setIsOpen(true)}
				aria-label="Search projects, media and comments"
			>
				<Search className="h-3.5 w-3.5" aria-hidden="true" />
				<span className="hidden sm:inline">Search</span>
			</Button>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Search</DialogTitle>
						<DialogDescription>
							Find projects, media and comments you have access to.
						</DialogDescription>
					</DialogHeader>

					<div className="relative">
						<Search
							className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							autoFocus
							className="pl-8"
							placeholder="Search by name or comment text…"
							aria-label="Search term"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						{isSearching && (
							<Loader2
								className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
								aria-hidden="true"
							/>
						)}
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<label htmlFor="search-media-type" className="sr-only">
							Filter by media type
						</label>
						<select
							id="search-media-type"
							className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							value={mediaType}
							onChange={(event) =>
								setMediaType(event.target.value as MediaTypeFilter)
							}
						>
							{MEDIA_TYPE_FILTERS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>

						<label htmlFor="search-review-status" className="sr-only">
							Filter by review status
						</label>
						<select
							id="search-review-status"
							className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							value={reviewStatus}
							onChange={(event) =>
								setReviewStatus(event.target.value as ReviewStatusFilter)
							}
						>
							{REVIEW_STATUS_FILTERS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>

						{(mediaType !== "ALL" || reviewStatus !== "ALL") && (
							<button
								className="text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => {
									setMediaType("ALL")
									setReviewStatus("ALL")
								}}
							>
								Clear filters
							</button>
						)}
					</div>

					<div className="max-h-80 overflow-y-auto">
						{!hasQuery ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								Type at least {MINIMUM_QUERY_LENGTH} characters to search.
							</p>
						) : totalHits(results) === 0 && !isSearching ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No matches for &ldquo;{query.trim()}&rdquo;.
							</p>
						) : (
							<div className="flex flex-col gap-4">
								<ResultGroup title="Projects">
									{results.projects.map((hit) => (
										<ResultRow
											key={hit.id}
											icon={<FolderIcon className="h-4 w-4" aria-hidden="true" />}
											primary={hit.label}
											onSelect={() => goTo(`/project/${hit.projectId}`)}
										/>
									))}
								</ResultGroup>

								<ResultGroup title="Media">
									{results.media.map((hit) => {
										const Icon = MEDIA_ICONS[hit.mediaType] ?? ImageIcon
										return (
											<ResultRow
												key={hit.id}
												icon={<Icon className="h-4 w-4" aria-hidden="true" />}
												primary={hit.label}
												secondary={hit.projectName}
												onSelect={() =>
													goTo(`/project/${hit.projectId}/image/${hit.id}`)
												}
											/>
										)
									})}
								</ResultGroup>

								<ResultGroup title="Comments">
									{results.comments.map((hit) => (
										<ResultRow
											key={hit.id}
											icon={
												<MessageSquare className="h-4 w-4" aria-hidden="true" />
											}
											primary={hit.label}
											secondary={`${hit.authorName || "Someone"} · ${hit.projectName}`}
											onSelect={() =>
												goTo(
													`/project/${hit.projectId}/image/${hit.imageId}?comment=${hit.id}`
												)
											}
										/>
									))}
								</ResultGroup>
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

function ResultGroup({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}) {
	const items = Array.isArray(children) ? children : [children]
	if (items.filter(Boolean).length === 0) return null

	return (
		<div>
			<p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{title}
			</p>
			<ul className="flex flex-col">{children}</ul>
		</div>
	)
}

function ResultRow({
	icon,
	primary,
	secondary,
	onSelect,
}: {
	icon: React.ReactNode
	primary: string
	secondary?: string
	onSelect: () => void
}) {
	return (
		<li>
			<button
				type="button"
				onClick={onSelect}
				className={cn(
					"flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm",
					"hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				)}
			>
				<span className="mt-0.5 text-muted-foreground">{icon}</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate">{primary}</span>
					{secondary && (
						<span className="block truncate text-xs text-muted-foreground">
							{secondary}
						</span>
					)}
				</span>
			</button>
		</li>
	)
}
