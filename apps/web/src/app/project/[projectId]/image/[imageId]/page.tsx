"use client"

import {
	useEffect,
	useState,
	useCallback,
	useMemo,
	useRef,
	Suspense,
} from "react"
import { useAuth } from "@/context/AuthContext"
import { ProjectMembersProvider } from "@/context/ProjectMembersContext"
import {
	useRouter,
	useParams,
	usePathname,
	useSearchParams,
} from "next/navigation"
import dynamic from "next/dynamic"
import { AnnotationCanvas } from "@/components/AnnotationCanvas"
import { VideoAnnotationCanvas } from "@/components/VideoAnnotationCanvas"
import { PdfAnnotationCanvas } from "@/components/PdfAnnotationCanvas"
import type {
	ModelFlyToRequest,
	ModelPin,
} from "@/components/ModelAnnotationCanvas"
import { AnnotationFooter, ComposeRange } from "@/components/AnnotationFooter"
import { CommentSidebar } from "@/components/CommentSidebar"
import { CompareView } from "@/components/CompareView"
import { TopHeader } from "@/components/TopHeader"
import { ExportMenu } from "@/components/ExportMenu"
import {
	Loader2,
	ChevronDown,
	Upload,
	Trash2,
	Columns2,
	Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
	Annotation,
	Image,
	ImageVersion,
	Comment,
	ModelAnchor,
	ProjectRole,
} from "@/types"
import { mediaUrl, roleAtLeast } from "@/lib/utils"
import {
	annotationTimeWindow,
	timeWindowsOverlap,
} from "@/lib/annotation-visibility"
import {
	captureThumbnail,
	getVideoDuration,
	thumbnailFileName,
	withMimeTypeTheApiCanMap,
} from "@/lib/media-capture"
import { prepareModelUpload } from "@/lib/model-capture"
import { extensionOf, isModelFile } from "@/lib/model-formats"
import {
	FILE_INPUT_ACCEPT,
	isNativelyPlayableVideo,
} from "@/lib/upload-formats"
import { useVersionComments } from "@/hooks/useVersionComments"
import { useAnnotationHistory } from "@/hooks/useAnnotationHistory"
import { usePresence } from "@/hooks/usePresence"
import { ReviewPanel } from "@/components/ReviewPanel"
import { UserAvatar } from "@/components/UserAvatar"
import {
	useVersionProcessingUpdates,
	VersionProcessingUpdate,
} from "@/hooks/useVersionProcessing"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const ModelAnnotationCanvas = dynamic(
	() =>
		import("@/components/ModelAnnotationCanvas").then(
			(mod) => mod.ModelAnnotationCanvas
		),
	{
		ssr: false,
		loading: () => (
			<div className="flex h-full w-full items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		),
	}
)

function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false)

	useEffect(() => {
		if (typeof window === "undefined") return

		const media = window.matchMedia(query)
		setMatches(media.matches)

		const listener = (event: MediaQueryListEvent) => {
			setMatches(event.matches)
		}

		media.addEventListener("change", listener)
		return () => {
			media.removeEventListener("change", listener)
		}
	}, [query])

	return matches
}

export type AnnotationTool = "pencil" | "rect" | "line"

const annotationsOf = (comment: Comment): Annotation[] =>
	Array.isArray(comment.annotation)
		? comment.annotation
		: comment.annotation
		? [comment.annotation]
		: []

function ProjectFileViewPageInner() {
	const params = useParams()
	const { isAuthenticated, loading, user } = useAuth()
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const searchParamsRef = useRef(searchParams)
	searchParamsRef.current = searchParams

	const [role, setRole] = useState<ProjectRole | null>(null)
	const [loadError, setLoadError] = useState(false)
	const [image, setImage] = useState<Image | null>(null)
	const [selectedVersion, setSelectedVersion] = useState<ImageVersion | null>(
		null
	)
	const [tool, setTool] = useState<AnnotationTool>("pencil")
	const [color, setColor] = useState("#4783E8")
	const [isImageLoading, setIsImageLoading] = useState(true)
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
	const [uploadFile, setUploadFile] = useState<File | null>(null)
	const [versionName, setVersionName] = useState("")
	const [isUploading, setIsUploading] = useState(false)
	const [isSidebarOpen, setIsSidebarOpen] = useState(true)

	const {
		annotations,
		currentAnnotation,
		setCurrentAnnotation,
		addAnnotation,
		undo,
		redo,
		clear,
		canUndo,
		canRedo,
	} = useAnnotationHistory()

	const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
		null
	)
	const [showAllAnnotations, setShowAllAnnotations] = useState(false)

	const [currentVideoTime, setCurrentVideoTime] = useState(0)
	const [seekRequest, setSeekRequest] = useState<{
		time: number
		nonce: number
	} | null>(null)
	const [composeRange, setComposeRange] = useState<ComposeRange | null>(null)

	const [currentPdfPage, setCurrentPdfPage] = useState(1)

	const [pendingPin, setPendingPin] = useState<ModelAnchor | null>(null)
	const [modelFlyTo, setModelFlyTo] = useState<ModelFlyToRequest | null>(null)

	const isVideo = selectedVersion?.mediaType === "VIDEO"
	const isPdf = selectedVersion?.mediaType === "PDF"
	const isModel = selectedVersion?.mediaType === "MODEL"

	const viewableModelUrl =
		selectedVersion?.proxyUrl ||
		(selectedVersion && extensionOf(selectedVersion.url) === "glb"
			? selectedVersion.url
			: null)

	const playableVideoUrl =
		selectedVersion?.proxyUrl ||
		(selectedVersion && isNativelyPlayableVideo(selectedVersion.url)
			? selectedVersion.url
			: null)
	const awaitingRendition =
		!!selectedVersion &&
		selectedVersion.proxyStatus === "PENDING" &&
		!selectedVersion.proxyUrl &&
		(isVideo ? !playableVideoUrl : selectedVersion.mediaType === "IMAGE")

	const {
		comments,
		isLoading: commentsLoading,
		refetch: refetchComments,
	} = useVersionComments(selectedVersion?.id ?? null)
	const peers = usePresence(
		selectedVersion?.id ?? null,
		isVideo ? currentVideoTime : 0
	)

	const applyVersionUpdate = useCallback((update: VersionProcessingUpdate) => {
		const patch = (version: ImageVersion) =>
			version.id === update.id ? { ...version, ...update } : version
		setImage((prev) =>
			prev ? { ...prev, versions: prev.versions.map(patch) } : prev
		)
		setSelectedVersion((prev) => (prev ? patch(prev) : prev))
	}, [])
	useVersionProcessingUpdates(selectedVersion?.id ?? null, applyVersionUpdate)

	const isSmallScreen = useMediaQuery("(max-width: 768px)")
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		setIsMounted(true)
	}, [])

	const imageId = params.imageId as string
	const projectId = params.projectId as string
	const URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

	const buildUrl = useCallback(
		(updates: Record<string, string | null>) => {
			const next = new URLSearchParams(searchParamsRef.current.toString())
			for (const [key, value] of Object.entries(updates)) {
				if (value === null) next.delete(key)
				else next.set(key, value)
			}
			const qs = next.toString()
			return qs ? `${pathname}?${qs}` : pathname
		},
		[pathname]
	)

	const fetchImage = useCallback(async () => {
		if (isAuthenticated) {
			setIsImageLoading(true)
			setLoadError(false)
			try {
				const res = await fetch(`${URI}/api/images/${imageId}`, {
					credentials: "include",
				})
				if (res.ok) {
					const data: Image = await res.json()
					setImage(data)
					const requested = searchParamsRef.current.get("v")
					const fromParam = data.versions?.find((v) => v.id === requested)
					setSelectedVersion(
						fromParam ??
							data.latestVersion ??
							(data.versions && data.versions.length > 0
								? data.versions[0]
								: null)
					)
				} else {
					setLoadError(true)
				}
			} catch (error) {
				console.error("Failed to fetch image:", error)
				setLoadError(true)
			} finally {
				setIsImageLoading(false)
			}
		}
	}, [isAuthenticated, imageId, URI])

	useEffect(() => {
		if (!isAuthenticated) return
		let cancelled = false

		const load = async (attempt = 0): Promise<void> => {
			try {
				const res = await fetch(`${URI}/api/projects/${projectId}/my-role`, {
					credentials: "include",
				})
				if (cancelled) return
				if (res.ok) {
					const data = await res.json()
					setRole(data?.role ?? null)
					return
				}
				if (res.status === 403) {
					setRole(null)
					return
				}
				throw new Error(`role fetch failed: ${res.status}`)
			} catch {
				if (cancelled || attempt >= 3) return
				setTimeout(() => load(attempt + 1), 1000 * (attempt + 1))
			}
		}

		load()
		return () => {
			cancelled = true
		}
	}, [isAuthenticated, projectId, URI])

	useEffect(() => {
		if (!loading && !isAuthenticated) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router])

	useEffect(() => {
		fetchImage()
	}, [fetchImage])

	const compareId = searchParams.get("compare")
	const compareVersion = useMemo(
		() =>
			compareId && image
				? image.versions.find((v) => v.id === compareId) ?? null
				: null,
		[compareId, image]
	)
	const isCompareMode =
		!!compareVersion && !!selectedVersion && (image?.versions.length ?? 0) >= 2

	useEffect(() => {
		if (!image || !compareId) return
		const valid =
			image.versions.length >= 2 &&
			image.versions.some((v) => v.id === compareId)
		if (!valid) {
			router.replace(buildUrl({ compare: null }), { scroll: false })
		}
	}, [image, compareId, router, buildUrl])

	const enterCompare = () => {
		if (!image || !selectedVersion || image.versions.length < 2) return
		const other =
			image.versions.find((v) => v.id !== selectedVersion.id) ??
			selectedVersion
		router.push(buildUrl({ v: selectedVersion.id, compare: other.id }), {
			scroll: false,
		})
	}

	const exitCompare = () => {
		router.replace(
			buildUrl({ v: selectedVersion?.id ?? null, compare: null }),
			{ scroll: false }
		)
	}

	const resetPerVersionState = useCallback(() => {
		clear()
		setSelectedCommentId(null)
		setCurrentVideoTime(0)
		setSeekRequest(null)
		setComposeRange(null)
		setCurrentPdfPage(1)
		setPendingPin(null)
		setModelFlyTo(null)
	}, [clear])

	const handleVersionSelect = (version: ImageVersion) => {
		setSelectedVersion(version)
		resetPerVersionState()
		router.replace(buildUrl({ v: version.id }), { scroll: false })
	}

	const selectedComment = useMemo(
		() => comments.find((c) => c.id === selectedCommentId) ?? null,
		[comments, selectedCommentId]
	)

	useEffect(() => {
		if (selectedCommentId && !selectedComment) setSelectedCommentId(null)
	}, [selectedCommentId, selectedComment])

	const handleSeekToTimestamp = useCallback((t: number) => {
		setSeekRequest((prev) => ({ time: t, nonce: (prev?.nonce ?? 0) + 1 }))
	}, [])

	const handleSelectComment = useCallback(
		(comment: Comment) => {
			const deselecting = selectedCommentId === comment.id
			setSelectedCommentId(deselecting ? null : comment.id)
			if (!deselecting) {
				if (isVideo && typeof comment.timestamp === "number") {
					handleSeekToTimestamp(comment.timestamp)
				}
				if (isPdf && typeof comment.page === "number") {
					setCurrentPdfPage(comment.page)
				}
				const savedCamera = comment.modelAnchor?.camera
				if (isModel && savedCamera) {
					setModelFlyTo((prev) => ({
						camera: savedCamera,
						nonce: (prev?.nonce ?? 0) + 1,
					}))
				}
			}
		},
		[selectedCommentId, isVideo, isPdf, isModel, handleSeekToTimestamp]
	)

	const handleSelectCommentById = useCallback(
		(commentId: string) => {
			const comment = comments.find((c) => c.id === commentId)
			if (comment) handleSelectComment(comment)
		},
		[comments, handleSelectComment]
	)

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setSelectedCommentId(null)
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [])

	const handleAddAnnotation = (newAnnotation: Omit<Annotation, "id">) => {
		setSelectedCommentId(null)
		addAnnotation(
			isPdf ? { ...newAnnotation, page: currentPdfPage } : newAnnotation
		)
	}

	const handleClear = () => {
		clear()
		setSelectedCommentId(null)
	}

	const handlePdfPageChange = (page: number) => {
		if (page === currentPdfPage) return
		setCurrentPdfPage(page)
		clear()
	}

	const handleMarkIn = () => {
		setComposeRange((prev) => {
			const start = currentVideoTime
			const end = prev?.end != null && prev.end >= start ? prev.end : null
			return { start, end }
		})
	}

	const handleMarkOut = () => {
		setComposeRange((prev) => {
			const end = currentVideoTime
			const start = prev?.start ?? end
			return start <= end
				? { start, end }
				: { start: end, end: start }
		})
	}

	const handleClearRange = () => setComposeRange(null)

	const composingRange =
		composeRange?.start != null && composeRange?.end != null
			? { start: composeRange.start, end: composeRange.end }
			: null

	const timelineMarkers = useMemo(
		() =>
			comments
				.filter((c) => typeof c.timestamp === "number")
				.map((c) => {
					const name = c.user.name || c.user.email
					return {
						commentId: c.id,
						t: c.timestamp as number,
						tEnd:
							typeof c.timestampEnd === "number" ? c.timestampEnd : undefined,
						label: name,
						initial: name.charAt(0).toUpperCase(),
						selected: c.id === selectedCommentId,
					}
				}),
		[comments, selectedCommentId]
	)

	const canvasAnnotations = useMemo(() => {
		let derived: Annotation[]
		if (isVideo) {
			const selectedWindow = selectedComment
				? annotationTimeWindow({
						t: selectedComment.timestamp,
						tEnd: selectedComment.timestampEnd,
					})
				: null

			derived = comments.flatMap((c) => {
				const isSelected = c.id === selectedCommentId
				const commentWindow = annotationTimeWindow({
					t: c.timestamp,
					tEnd: c.timestampEnd,
				})

				if (
					selectedComment &&
					!isSelected &&
					!timeWindowsOverlap(commentWindow, selectedWindow)
				) {
					return []
				}

				return annotationsOf(c).map((a) => ({
					...a,
					t: typeof c.timestamp === "number" ? c.timestamp : a.t,
					tEnd: typeof c.timestampEnd === "number" ? c.timestampEnd : a.tEnd,
					isHighlighted: isSelected,
					pinned: !!selectedComment,
					dimmed: !!selectedComment && !isSelected,
				}))
			})
			return [
				...annotations.map(
					(a): Annotation => ({ ...a, t: undefined, tEnd: undefined })
				),
				...derived,
			]
		}
		const source = isPdf
			? comments.filter((c) => (c.page ?? 1) === currentPdfPage)
			: comments
		if (showAllAnnotations) {
			derived = source.flatMap((c) =>
				annotationsOf(c).map((a) => ({
					...a,
					isHighlighted: c.id === selectedCommentId,
					dimmed: c.id !== selectedCommentId,
				}))
			)
		} else if (
			selectedComment &&
			(!isPdf || (selectedComment.page ?? 1) === currentPdfPage)
		) {
			derived = annotationsOf(selectedComment).map((a) => ({
				...a,
				isHighlighted: true,
			}))
		} else {
			derived = []
		}
		return [...annotations, ...derived]
	}, [
		annotations,
		comments,
		isVideo,
		isPdf,
		currentPdfPage,
		selectedComment,
		selectedCommentId,
		showAllAnnotations,
	])

	const scrubberPeers = useMemo(
		() =>
			peers.map((p) => ({
				socketId: p.socketId,
				name: p.user.name || "Someone",
				initial: (p.user.name || "S").charAt(0).toUpperCase(),
				time: p.time,
			})),
		[peers]
	)

	const viewerStrip = useMemo(() => {
		const byUser = new Map<string, { name: string; avatarUrl?: string | null }>()
		peers.forEach((p) => {
			if (!byUser.has(p.user.id)) {
				byUser.set(p.user.id, {
					name: p.user.name || "Someone",
					avatarUrl: p.user.avatarUrl ?? null,
				})
			}
		})
		return Array.from(byUser.values())
	}, [peers])

	const modelPins = useMemo<ModelPin[]>(() => {
		if (!isModel) return []
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
				anchor: c.modelAnchor as ModelAnchor,
				selected: c.id === selectedCommentId,
			}))
	}, [comments, isModel, selectedCommentId])

	const handlePlacePin = useCallback((anchor: ModelAnchor) => {
		setSelectedCommentId(null)
		setPendingPin(anchor)
	}, [])

	const canComment = roleAtLeast(role, "MEMBER")
	const canEditMedia = roleAtLeast(role, "EDITOR")

	const handleCommentAdded = () => {
		setCurrentAnnotation(null)
		setComposeRange(null)
		setPendingPin(null)
		refetchComments()
	}

	const handleUploadNewVersion = async () => {
		if (!uploadFile || !imageId) return

		setIsUploading(true)
		try {
			const fileToUpload = withMimeTypeTheApiCanMap(uploadFile)
			const formData = new FormData()
			formData.append("image", fileToUpload)
			if (versionName) {
				formData.append("versionName", versionName)
			}

			if (fileToUpload.type.startsWith("video/")) {
				const duration = await getVideoDuration(fileToUpload)
				if (duration != null) formData.append("duration", String(duration))
			}
			const prepared = isModelFile(fileToUpload)
				? await prepareModelUpload(fileToUpload)
				: null
			const thumbnail = prepared
				? prepared.thumbnail
				: await captureThumbnail(fileToUpload)
			if (thumbnail) formData.append("thumbnail", thumbnail, thumbnailFileName(thumbnail))
			if (prepared?.glb) {
				formData.append("modelProxy", prepared.glb, "converted.glb")
			}

			const res = await fetch(`${URI}/api/images/${imageId}/versions`, {
				method: "POST",
				credentials: "include",
				body: formData,
			})

			if (res.ok) {
				const updatedImage = await res.json()
				setImage(updatedImage)

				if (updatedImage.versions && updatedImage.versions.length > 0) {
					setSelectedVersion(updatedImage.versions[0])
					resetPerVersionState()
				}

				setIsUploadModalOpen(false)
				setUploadFile(null)
				setVersionName("")
			}
		} catch (error) {
			console.error("Failed to upload new version:", error)
		} finally {
			setIsUploading(false)
		}
	}

	const handleDeleteVersion = async (versionId: string) => {
		if (!confirm("Are you sure you want to delete this version?")) return

		try {
			const res = await fetch(`${URI}/api/images/versions/${versionId}`, {
				method: "DELETE",
				credentials: "include",
			})

			if (res.ok) {
				const remainingVersions =
					image?.versions.filter((v) => v.id !== versionId) ?? []
				setImage((prev) =>
					prev ? { ...prev, versions: remainingVersions } : null
				)

				if (selectedVersion?.id === versionId) {
					const next = remainingVersions[0] ?? null
					setSelectedVersion(next)
					resetPerVersionState()
					router.replace(buildUrl({ v: next?.id ?? null }), { scroll: false })
				}
				if (compareId === versionId) {
					router.replace(buildUrl({ compare: null }), { scroll: false })
				}
			} else {
				const errorData = await res.json()
				alert(errorData.message || "Failed to delete version")
			}
		} catch (error) {
			console.error("Error deleting version:", error)
			alert("An error occurred while deleting the version")
		}
	}

	if (loading || !isMounted) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
			</div>
		)
	}

	if (loadError) {
		return (
			<div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
				<p className="text-lg font-medium">This file couldn&apos;t be loaded</p>
				<p className="max-w-sm text-sm text-muted-foreground">
					It may have been deleted, or you may not have access to its project.
				</p>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => fetchImage()}>
						Try again
					</Button>
					<Button onClick={() => router.push(`/project/${projectId}`)}>
						Back to project
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="flex h-screen w-full flex-col bg-background text-foreground">
			<TopHeader
				imageName={image?.name || "Image"}
				projectId={projectId}
				onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
				isSidebarOpen={isSidebarOpen}
			>
				{viewerStrip.length > 0 && (
					<div
						className="flex items-center -space-x-2"
						aria-label={`${viewerStrip.length} other ${
							viewerStrip.length === 1 ? "person is" : "people are"
						} viewing this version`}
					>
						{viewerStrip.slice(0, 5).map((viewer, i) => (
							<span
								key={`${viewer.name}-${i}`}
								title={`${viewer.name} is viewing`}
							>
								<UserAvatar
									className="h-6 w-6 border-2 border-background"
									fallbackClassName="text-[10px]"
									name={viewer.name}
									avatarUrl={viewer.avatarUrl}
								/>
							</span>
						))}
						{viewerStrip.length > 5 && (
							<div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px]">
								+{viewerStrip.length - 5}
							</div>
						)}
					</div>
				)}
				{selectedVersion?.proxyStatus === "PENDING" && (
					<span className="flex items-center gap-1 text-xs text-muted-foreground">
						<Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
						{isVideo ? "Optimizing video…" : "Preparing preview…"}
					</span>
				)}
				{image && image.versions && image.versions.length >= 2 && (
					<Button
						variant={isCompareMode ? "default" : "outline"}
						size="sm"
						className="gap-1"
						onClick={isCompareMode ? exitCompare : enterCompare}
						aria-pressed={isCompareMode}
					>
						<Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
						{isCompareMode ? "Exit compare" : "Compare"}
					</Button>
				)}
				{!isCompareMode && !isVideo && !isModel && selectedVersion && (
					<Button
						variant={showAllAnnotations ? "default" : "outline"}
						size="icon"
						className="h-8 w-8"
						onClick={() => setShowAllAnnotations((v) => !v)}
						aria-pressed={showAllAnnotations}
						aria-label={
							showAllAnnotations
								? "Hide all comment drawings"
								: "Show all comment drawings"
						}
					>
						<Eye className="h-4 w-4" aria-hidden="true" />
					</Button>
				)}
				{!isCompareMode &&
					image &&
					image.versions &&
					image.versions.length > 0 && (
						<div className="flex items-center gap-2">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm" className="gap-1">
										{selectedVersion?.versionName || "Select version"}
										<ChevronDown className="h-3.5 w-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{image.versions.map((version) => (
										<DropdownMenuItem
											key={version.id}
											onClick={() => handleVersionSelect(version)}
											className={
												selectedVersion?.id === version.id ? "bg-accent" : ""
											}
										>
											<div className="flex w-full justify-between items-center">
												<span>{version.versionName}</span>
												{image.versions.length > 1 && canEditMedia && (
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6 ml-2 text-destructive"
														onClick={(e) => {
															e.stopPropagation()
															handleDeleteVersion(version.id)
														}}
														aria-label={`Delete ${version.versionName}`}
													>
														<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
													</Button>
												)}
											</div>
										</DropdownMenuItem>
									))}
									{canEditMedia && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem onClick={() => setIsUploadModalOpen(true)}>
												<Upload className="mr-2 h-4 w-4" />
												Upload new version
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				{!isCompareMode && !isPdf && !isModel && image && selectedVersion && (
					<ExportMenu
						image={image}
						selectedVersion={selectedVersion}
						annotations={annotations}
					/>
				)}
			</TopHeader>
			{isCompareMode && image && selectedVersion && compareVersion ? (
				<CompareView
					versions={image.versions}
					leftVersion={selectedVersion}
					rightVersion={compareVersion}
					onLeftChange={handleVersionSelect}
					onRightChange={(version) =>
						router.replace(buildUrl({ compare: version.id }), {
							scroll: false,
						})
					}
				/>
			) : (
				<div
					className={`flex flex-1 overflow-hidden ${
						isSmallScreen ? "flex-col" : "flex-row"
					}`}
				>
					<main
						className={`relative flex flex-1 flex-col ${
							isSmallScreen && isSidebarOpen ? "h-[60%]" : "h-full"
						}`}
					>
						<div className="flex-1 flex items-center justify-center bg-muted/20 overflow-auto">
							{isImageLoading ? (
								<div className="flex h-full w-full items-center justify-center">
									<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
								</div>
							) : selectedVersion ? (
								isVideo ? (
									!playableVideoUrl ? (
										<div className="flex h-full w-full flex-col items-center justify-center gap-2">
											<Loader2
												className="h-6 w-6 animate-spin text-muted-foreground"
												aria-hidden="true"
											/>
											<p className="text-sm text-muted-foreground">
												Preparing this video for playback…
											</p>
										</div>
									) : (
									<VideoAnnotationCanvas
										videoUrl={mediaUrl(playableVideoUrl)}
										tool={tool}
										color={color}
										canDraw={canComment}
										markers={timelineMarkers}
										peers={scrubberPeers}
										composingRange={composingRange}
										onSelectComment={handleSelectCommentById}
										onAddAnnotation={handleAddAnnotation}
										onTimeChange={(t) => setCurrentVideoTime(t)}
										onPlayStateChange={(playing) => {
											if (playing) setSelectedCommentId(null)
										}}
										seekRequest={seekRequest}
										initialDuration={selectedVersion.duration}
										frameRate={selectedVersion.frameRate ?? undefined}
										annotations={canvasAnnotations}
									/>
									)
								) : isModel ? (
									viewableModelUrl ? (
										<ModelAnnotationCanvas
											modelUrl={mediaUrl(viewableModelUrl)}
											canComment={canComment}
											pins={modelPins}
											pendingPin={pendingPin}
											flyTo={modelFlyTo}
											onPlacePin={handlePlacePin}
											onSelectComment={handleSelectCommentById}
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center p-4 text-center">
											<p className="max-w-sm text-sm text-muted-foreground">
												This model has no viewable version. It was stored
												before conversion succeeded — re-upload it, exporting
												to GLB from your 3D tool if the original format keeps
												failing.
											</p>
										</div>
									)
								) : isPdf ? (
									<PdfAnnotationCanvas
										pdfUrl={mediaUrl(selectedVersion.url)}
										pageNumber={currentPdfPage}
										onPageChange={handlePdfPageChange}
										tool={tool}
										color={color}
										canDraw={canComment}
										onAddAnnotation={handleAddAnnotation}
										annotations={canvasAnnotations}
									/>
								) : awaitingRendition ? (
									<div className="flex h-full w-full flex-col items-center justify-center gap-2">
										<Loader2
											className="h-6 w-6 animate-spin text-muted-foreground"
											aria-hidden="true"
										/>
										<p className="text-sm text-muted-foreground">
											Preparing a preview of this file…
										</p>
									</div>
								) : (
									<AnnotationCanvas
										imageUrl={mediaUrl(
											selectedVersion.proxyUrl || selectedVersion.url
										)}
										tool={tool}
										color={color}
										onAddAnnotation={handleAddAnnotation}
										annotations={canvasAnnotations}
									/>
								)
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<p className="text-muted-foreground">No version available</p>
								</div>
							)}
						</div>
						{canComment ? (
							<div className="border-t border-border">
								<AnnotationFooter
									tool={tool}
									setTool={setTool}
									color={color}
									setColor={setColor}
									onUndo={undo}
									onRedo={redo}
									onClear={handleClear}
									canUndo={canUndo}
									canRedo={canRedo}
									currentAnnotation={currentAnnotation}
									annotations={annotations}
									imageVersionId={selectedVersion?.id || ""}
									onCommentAdded={handleCommentAdded}
									timestamp={isVideo ? currentVideoTime : null}
									composeRange={isVideo ? composeRange ?? undefined : undefined}
									onMarkIn={handleMarkIn}
									onMarkOut={handleMarkOut}
									onClearRange={handleClearRange}
									page={isPdf ? currentPdfPage : null}
									modelAnchor={isModel ? pendingPin : undefined}
									onClearModelAnchor={() => setPendingPin(null)}
									canPostInternal={canEditMedia}
								/>
							</div>
						) : (
							role && (
								<div className="border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
									You have view-only access to this project.
								</div>
							)
						)}
					</main>
					{isSidebarOpen && selectedVersion && (
						<CommentSidebar
							comments={comments}
							isLoading={commentsLoading}
							onRefresh={refetchComments}
							selectedCommentId={selectedCommentId}
							onSelectComment={handleSelectComment}
							className={
								isSmallScreen
									? "h-[40%] w-full border-t border-l-0"
									: "h-full w-80 border-l"
							}
							onSeek={isVideo ? handleSeekToTimestamp : undefined}
							onGoToPage={isPdf ? handlePdfPageChange : undefined}
							currentPage={isPdf ? currentPdfPage : null}
							canReply={canComment}
							reviewPanel={
								selectedVersion ? (
									<ReviewPanel
										key={selectedVersion.id}
										imageVersionId={selectedVersion.id}
										canDecide={canComment}
										currentUser={user}
									/>
								) : null
							}
						/>
					)}
				</div>
			)}

			<Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Upload New Version</DialogTitle>
						<DialogDescription>
							Upload a new version (image, video, PDF or 3D model) of this file
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div>
							<Input
								type="text"
								placeholder="Version name (optional)"
								aria-label="Version name"
								value={versionName}
								onChange={(e) => setVersionName(e.target.value)}
							/>
						</div>
						<div>
							<Input
								type="file"
								aria-label="Version file"
								onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
								accept={FILE_INPUT_ACCEPT}
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setIsUploadModalOpen(false)}
							>
								Cancel
							</Button>
							<Button
								onClick={handleUploadNewVersion}
								disabled={!uploadFile || isUploading}
							>
								{isUploading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Uploading...
									</>
								) : (
									"Upload"
								)}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default function ProjectFileViewPage() {
	const params = useParams()
	const projectId = params.projectId as string
	return (
		<Suspense
			fallback={
				<div className="flex h-screen w-full items-center justify-center bg-background">
					<Loader2 className="h-8 w-8 animate-spin text-primary/70" />
				</div>
			}
		>
			<ProjectMembersProvider projectId={projectId}>
				<ProjectFileViewPageInner />
			</ProjectMembersProvider>
		</Suspense>
	)
}
