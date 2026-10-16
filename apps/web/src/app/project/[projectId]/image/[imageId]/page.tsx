"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useAuth } from "@/context/AuthContext"
import { ProjectMembersProvider } from "@/context/ProjectMembersContext"
import { useParams } from "next/navigation"
import type { ModelFlyToRequest } from "@/components/ModelAnnotationCanvas"
import { ViewerSurface } from "@/components/ViewerSurface"
import { AnnotationFooter } from "@/components/AnnotationFooter"
import { CommentSidebar } from "@/components/CommentSidebar"
import { CompareView } from "@/components/CompareView"
import { TopHeader } from "@/components/TopHeader"
import { ExportMenu } from "@/components/ExportMenu"
import { VersionMenu } from "@/components/VersionMenu"
import { ViewerPresenceStrip } from "@/components/ViewerPresenceStrip"
import { ViewerWatermark } from "@/components/ViewerWatermark"
import { mayDownloadOriginals } from "@/lib/content-policy"
import { Loader2, Columns2, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Annotation,
	AnnotationTool,
	ImageVersion,
	Comment,
	ModelAnchor,
} from "@/types"
import { roleAtLeast } from "@/lib/utils"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { extensionOf } from "@/lib/model-formats"
import { isNativelyPlayableVideo } from "@/lib/upload-formats"
import {
	canvasAnnotationsFor,
	modelPinsFor,
	scrubberPeersFor,
	timelineMarkersFor,
	viewingPeopleFor,
} from "@/lib/viewer-overlays"
import { useVersionComments } from "@/hooks/useVersionComments"
import { useAnnotationHistory } from "@/hooks/useAnnotationHistory"
import { useComposeRange } from "@/hooks/useComposeRange"
import { usePresence } from "@/hooks/usePresence"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useCompareMode, useFileViewer } from "@/hooks/useFileViewer"
import { ReviewPanel } from "@/components/ReviewPanel"
import { UploadVersionDialog } from "@/components/UploadVersionDialog"
import { ConfirmationModal } from "@/components/ConfirmationModal"
import { toast } from "sonner"

function ProjectFileViewPageInner() {
	const params = useParams()
	const { isAuthenticated, loading, user } = useAuth()
	const imageId = params.imageId as string
	const projectId = params.projectId as string

	const {
		router,
		searchParams,
		buildUrl,
		role,
		contentPolicy,
		loadError,
		image,
		setImage,
		selectedVersion,
		setSelectedVersion,
		isImageLoading,
		fetchImage,
	} = useFileViewer({ imageId, projectId, isAuthenticated })

	const [tool, setTool] = useState<AnnotationTool>("pencil")
	const [color, setColor] = useState("#4783E8")
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
	const [versionToDelete, setVersionToDelete] = useState<ImageVersion | null>(
		null
	)
	const [isDeletingVersion, setIsDeletingVersion] = useState(false)
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
	const {
		composeRange,
		composingRange,
		handleMarkIn,
		handleMarkOut,
		clearRange,
	} = useComposeRange(currentVideoTime)

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
		isLoadingMore: commentsLoadingMore,
		hasMore: hasMoreComments,
		loadMore: loadMoreComments,
		syncAfterChange: syncCommentsAfterChange,
	} = useVersionComments(selectedVersion?.id ?? null)
	const peers = usePresence(
		selectedVersion?.id ?? null,
		isVideo ? currentVideoTime : 0
	)

	const isSmallScreen = useMediaQuery("(max-width: 768px)")
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		setIsMounted(true)
	}, [])

	useEffect(() => {
		if (!loading && !isAuthenticated) {
			router.push("/login")
		}
	}, [isAuthenticated, loading, router])

	const { compareId, compareVersion, isCompareMode, enterCompare, exitCompare } =
		useCompareMode({ image, selectedVersion, searchParams, buildUrl, router })

	const resetPerVersionState = useCallback(() => {
		clear()
		setSelectedCommentId(null)
		setCurrentVideoTime(0)
		setSeekRequest(null)
		clearRange()
		setCurrentPdfPage(1)
		setPendingPin(null)
		setModelFlyTo(null)
	}, [clear, clearRange])

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

	const timelineMarkers = useMemo(
		() => timelineMarkersFor(comments, selectedCommentId),
		[comments, selectedCommentId]
	)

	const canvasAnnotations = useMemo(
		() =>
			canvasAnnotationsFor({
				drafts: annotations,
				comments,
				selectedComment,
				selectedCommentId,
				isVideo,
				isPdf,
				currentPdfPage,
				showAllAnnotations,
			}),
		[
			annotations,
			comments,
			isVideo,
			isPdf,
			currentPdfPage,
			selectedComment,
			selectedCommentId,
			showAllAnnotations,
		]
	)

	const scrubberPeers = useMemo(() => scrubberPeersFor(peers), [peers])

	const viewingPeople = useMemo(() => viewingPeopleFor(peers), [peers])

	const modelPins = useMemo(
		() => (isModel ? modelPinsFor(comments, selectedCommentId) : []),
		[comments, isModel, selectedCommentId]
	)

	const handlePlacePin = useCallback((anchor: ModelAnchor) => {
		setSelectedCommentId(null)
		setPendingPin(anchor)
	}, [])

	const showWatermark = contentPolicy.watermarkViewers && !!user?.email
	const canComment = roleAtLeast(role, "MEMBER")
	const canEditMedia = roleAtLeast(role, "EDITOR")

	const handleCommentAdded = () => {
		setCurrentAnnotation(null)
		clearRange()
		setPendingPin(null)
		syncCommentsAfterChange()
	}

	const handleVersionUploaded = (updatedImage: NonNullable<typeof image>) => {
		setImage(updatedImage)
		const newest = updatedImage.versions?.[0]
		if (newest) {
			setSelectedVersion(newest)
			resetPerVersionState()
		}
	}

	const handleDeleteVersion = async (versionId: string) => {
		setIsDeletingVersion(true)
		try {
			await api.delete(`/api/images/versions/${versionId}`)

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
		} catch (error) {
			toast.error(describeError(error, "Could not delete the version."))
		} finally {
			setIsDeletingVersion(false)
			setVersionToDelete(null)
		}
	}

	if (loading || !isMounted) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary/70" aria-hidden="true" />
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
				<ViewerPresenceStrip viewers={viewingPeople} />
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
						<VersionMenu
							versions={image.versions}
							selectedVersion={selectedVersion}
							canEdit={canEditMedia}
							onSelect={handleVersionSelect}
							onRequestDelete={setVersionToDelete}
							onRequestUpload={() => setIsUploadModalOpen(true)}
						/>
					)}
				{!isCompareMode && !isPdf && !isModel && image && selectedVersion && (
					<ExportMenu
						image={image}
						selectedVersion={selectedVersion}
						annotations={annotations}
						canDownloadOriginal={mayDownloadOriginals(contentPolicy, role)}
					/>
				)}
			</TopHeader>
			{isCompareMode && image && selectedVersion && compareVersion ? (
				<div className="relative flex flex-1 overflow-hidden">
					{showWatermark && <ViewerWatermark email={user?.email ?? ""} />}
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
				</div>
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
						<div className="relative flex-1 flex items-center justify-center bg-muted/20 overflow-auto">
							{showWatermark && <ViewerWatermark email={user?.email ?? ""} />}
							<ViewerSurface
								isImageLoading={isImageLoading}
								selectedVersion={selectedVersion}
								playableVideoUrl={playableVideoUrl}
								viewableModelUrl={viewableModelUrl}
								awaitingRendition={awaitingRendition}
								tool={tool}
								color={color}
								canComment={canComment}
								canExportFrames={mayDownloadOriginals(contentPolicy, role)}
								canvasAnnotations={canvasAnnotations}
								onAddAnnotation={handleAddAnnotation}
								onSelectCommentById={handleSelectCommentById}
								timelineMarkers={timelineMarkers}
								scrubberPeers={scrubberPeers}
								composingRange={composingRange}
								seekRequest={seekRequest}
								onVideoTimeChange={setCurrentVideoTime}
								onVideoPlayStateChange={(playing) => {
									if (playing) setSelectedCommentId(null)
								}}
								currentPdfPage={currentPdfPage}
								onPdfPageChange={handlePdfPageChange}
								modelPins={modelPins}
								pendingPin={pendingPin}
								modelFlyTo={modelFlyTo}
								onPlacePin={handlePlacePin}
							/>
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
									onClearRange={clearRange}
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
							isLoadingMore={commentsLoadingMore}
							hasMore={hasMoreComments}
							onLoadMore={loadMoreComments}
							comments={comments}
							isLoading={commentsLoading}
							onRefresh={syncCommentsAfterChange}
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

			<UploadVersionDialog
				imageId={imageId}
				open={isUploadModalOpen}
				onOpenChange={setIsUploadModalOpen}
				onUploaded={handleVersionUploaded}
			/>

			<ConfirmationModal
				isOpen={!!versionToDelete}
				onClose={() => setVersionToDelete(null)}
				onConfirm={() => {
					if (versionToDelete) handleDeleteVersion(versionToDelete.id)
				}}
				title="Delete this version?"
				description={`"${
					versionToDelete?.versionName ?? "This version"
				}" and its comments will be permanently deleted.`}
				confirmText="Delete version"
				isConfirming={isDeletingVersion}
			/>
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
					<Loader2 className="h-8 w-8 animate-spin text-primary/70" aria-hidden="true" />
				</div>
			}
		>
			<ProjectMembersProvider projectId={projectId}>
				<ProjectFileViewPageInner />
			</ProjectMembersProvider>
		</Suspense>
	)
}
