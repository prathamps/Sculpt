"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { AnnotationCanvas } from "./AnnotationCanvas"
import { VideoAnnotationCanvas } from "./VideoAnnotationCanvas"
import { PdfAnnotationCanvas } from "./PdfAnnotationCanvas"
import type { ModelPin } from "./ModelAnnotationCanvas"
import { Button } from "./ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { ChevronDown, MessageSquare, Pencil } from "lucide-react"
import { Annotation, Comment, ImageVersion } from "@/types"
import { cn, mediaUrl } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

// three.js touches window at module scope, so the 3D canvas loads client-only.
const ModelAnnotationCanvas = dynamic(
	() =>
		import("./ModelAnnotationCanvas").then((mod) => mod.ModelAnnotationCanvas),
	{ ssr: false }
)

interface ComparePaneProps {
	label: string
	version: ImageVersion
	versions: ImageVersion[]
	onVersionChange: (version: ImageVersion) => void
}

const flattenAnnotations = (comments: Comment[]): Annotation[] =>
	comments.flatMap((comment) => {
		const list = Array.isArray(comment.annotation)
			? comment.annotation
			: comment.annotation
			? [comment.annotation]
			: []
		return list.map((a) => ({
			...a,
			t: typeof comment.timestamp === "number" ? comment.timestamp : a.t,
			tEnd:
				typeof comment.timestampEnd === "number"
					? comment.timestampEnd
					: a.tEnd,
			page: typeof comment.page === "number" ? comment.page : a.page,
		}))
	})

// One half of the version compare view: a version picker, comment count and
// a read-only render of that version's media with its comment markup.
export function ComparePane({
	label,
	version,
	versions,
	onVersionChange,
}: ComparePaneProps) {
	const [comments, setComments] = useState<Comment[]>([])
	const [showMarkup, setShowMarkup] = useState(true)
	const [pdfPage, setPdfPage] = useState(1)

	useEffect(() => {
		let cancelled = false
		setComments([])
		setPdfPage(1)
		;(async () => {
			try {
				const res = await fetch(
					`${API_URL}/api/images/versions/${version.id}/comments`,
					{ credentials: "include" }
				)
				if (res.ok && !cancelled) setComments(await res.json())
			} catch (error) {
				console.error("Failed to fetch comments for compare pane:", error)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [version.id])

	const annotations = useMemo(
		() => (showMarkup ? flattenAnnotations(comments) : []),
		[comments, showMarkup]
	)

	const modelPins = useMemo<ModelPin[]>(() => {
		if (version.mediaType !== "MODEL" || !showMarkup) return []
		return comments
			.filter((c) => c.modelAnchor)
			.slice()
			.sort(
				(a, b) =>
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
			)
			.map((c, index) => ({
				commentId: c.id,
				number: index + 1,
				label: c.user.name || c.user.email,
				anchor: c.modelAnchor!,
				selected: false,
			}))
	}, [comments, showMarkup, version.mediaType])

	const renderMedia = () => {
		if (version.mediaType === "MODEL") {
			return (
				<ModelAnnotationCanvas
					modelUrl={mediaUrl(version.url)}
					canComment={false}
					pins={modelPins}
				/>
			)
		}
		if (version.mediaType === "VIDEO") {
			return (
				<VideoAnnotationCanvas
					videoUrl={mediaUrl(version.proxyUrl || version.url)}
					tool="pencil"
					color="#4783E8"
					canDraw={false}
					enableShortcuts={false}
					annotations={annotations}
					onAddAnnotation={() => undefined}
					initialDuration={version.duration}
					markers={comments
						.filter((c) => typeof c.timestamp === "number")
						.map((c) => {
							const name = c.user.name || c.user.email
							return {
								commentId: c.id,
								t: c.timestamp as number,
								tEnd: c.timestampEnd,
								label: name,
								initial: name.charAt(0).toUpperCase(),
							}
						})}
				/>
			)
		}
		if (version.mediaType === "PDF") {
			return (
				<PdfAnnotationCanvas
					pdfUrl={mediaUrl(version.url)}
					pageNumber={pdfPage}
					onPageChange={setPdfPage}
					tool="pencil"
					color="#4783E8"
					canDraw={false}
					annotations={annotations.filter(
						(a) => a.page === undefined || a.page === pdfPage
					)}
				/>
			)
		}
		return (
			<AnnotationCanvas
				imageUrl={mediaUrl(version.url)}
				tool="pencil"
				color="#4783E8"
				readOnly
				annotations={annotations}
			/>
		)
	}

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-card px-3 py-2">
				<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
					{label}
				</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
							{version.versionName}
							<ChevronDown className="h-3 w-3" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{versions.map((v) => (
							<DropdownMenuItem
								key={v.id}
								onClick={() => onVersionChange(v)}
								className={cn("text-xs", v.id === version.id && "bg-accent")}
							>
								{v.versionName}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<span
					className="flex items-center gap-1 text-xs text-muted-foreground"
					title={`${comments.length} comments on this version`}
				>
					<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
					{comments.length}
				</span>
				<Button
					variant={showMarkup ? "default" : "outline"}
					size="sm"
					className="ml-auto h-7 gap-1 text-xs"
					onClick={() => setShowMarkup((v) => !v)}
					aria-pressed={showMarkup}
					aria-label={`${showMarkup ? "Hide" : "Show"} comment markup for ${
						version.versionName
					}`}
				>
					<Pencil className="h-3 w-3" aria-hidden="true" />
					Markup
				</Button>
			</div>
			<div className="min-h-0 flex-1">{renderMedia()}</div>
		</div>
	)
}
