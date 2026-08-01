"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { AnnotationCanvas } from "@/components/AnnotationCanvas"
import { VideoAnnotationCanvas } from "@/components/VideoAnnotationCanvas"
import { PdfAnnotationCanvas } from "@/components/PdfAnnotationCanvas"
import type {
	ModelFlyToRequest,
	ModelPin,
} from "@/components/ModelAnnotationCanvas"
import type { ScrubberMarker, ScrubberPeer } from "@/components/Scrubber"
import { Annotation, AnnotationTool, ImageVersion, ModelAnchor } from "@/types"
import { mediaUrl } from "@/lib/utils"

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

const CenteredSpinner = ({ message }: { message?: string }) => (
	<div className="flex h-full w-full flex-col items-center justify-center gap-2">
		<Loader2
			className="h-6 w-6 animate-spin text-muted-foreground"
			aria-hidden="true"
		/>
		{message && <p className="text-sm text-muted-foreground">{message}</p>}
	</div>
)

interface ViewerSurfaceProps {
	isImageLoading: boolean
	selectedVersion: ImageVersion | null
	playableVideoUrl: string | null
	viewableModelUrl: string | null
	awaitingRendition: boolean
	tool: AnnotationTool
	color: string
	canComment: boolean
	canvasAnnotations: Annotation[]
	onAddAnnotation: (annotation: Omit<Annotation, "id">) => void
	onSelectCommentById: (commentId: string) => void
	timelineMarkers: ScrubberMarker[]
	scrubberPeers: ScrubberPeer[]
	composingRange: { start: number; end: number } | null
	seekRequest: { time: number; nonce: number } | null
	onVideoTimeChange: (time: number) => void
	onVideoPlayStateChange: (playing: boolean) => void
	currentPdfPage: number
	onPdfPageChange: (page: number) => void
	modelPins: ModelPin[]
	pendingPin: ModelAnchor | null
	modelFlyTo: ModelFlyToRequest | null
	onPlacePin: (anchor: ModelAnchor) => void
}

export function ViewerSurface({
	isImageLoading,
	selectedVersion,
	playableVideoUrl,
	viewableModelUrl,
	awaitingRendition,
	tool,
	color,
	canComment,
	canvasAnnotations,
	onAddAnnotation,
	onSelectCommentById,
	timelineMarkers,
	scrubberPeers,
	composingRange,
	seekRequest,
	onVideoTimeChange,
	onVideoPlayStateChange,
	currentPdfPage,
	onPdfPageChange,
	modelPins,
	pendingPin,
	modelFlyTo,
	onPlacePin,
}: ViewerSurfaceProps) {
	if (isImageLoading) {
		return <CenteredSpinner />
	}

	if (!selectedVersion) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<p className="text-muted-foreground">No version available</p>
			</div>
		)
	}

	if (selectedVersion.mediaType === "VIDEO") {
		if (!playableVideoUrl) {
			return <CenteredSpinner message="Preparing this video for playback…" />
		}
		return (
			<VideoAnnotationCanvas
				videoUrl={mediaUrl(playableVideoUrl)}
				tool={tool}
				color={color}
				canDraw={canComment}
				markers={timelineMarkers}
				peers={scrubberPeers}
				composingRange={composingRange}
				onSelectComment={onSelectCommentById}
				onAddAnnotation={onAddAnnotation}
				onTimeChange={onVideoTimeChange}
				onPlayStateChange={onVideoPlayStateChange}
				seekRequest={seekRequest}
				initialDuration={selectedVersion.duration}
				frameRate={selectedVersion.frameRate ?? undefined}
				annotations={canvasAnnotations}
			/>
		)
	}

	if (selectedVersion.mediaType === "MODEL") {
		if (!viewableModelUrl) {
			return (
				<div className="flex h-full w-full items-center justify-center p-4 text-center">
					<p className="max-w-sm text-sm text-muted-foreground">
						This model has no viewable version. It was stored before conversion
						succeeded — re-upload it, exporting to GLB from your 3D tool if the
						original format keeps failing.
					</p>
				</div>
			)
		}
		return (
			<ModelAnnotationCanvas
				modelUrl={mediaUrl(viewableModelUrl)}
				canComment={canComment}
				pins={modelPins}
				pendingPin={pendingPin}
				flyTo={modelFlyTo}
				onPlacePin={onPlacePin}
				onSelectComment={onSelectCommentById}
			/>
		)
	}

	if (selectedVersion.mediaType === "PDF") {
		return (
			<PdfAnnotationCanvas
				pdfUrl={mediaUrl(selectedVersion.url)}
				pageNumber={currentPdfPage}
				onPageChange={onPdfPageChange}
				tool={tool}
				color={color}
				canDraw={canComment}
				onAddAnnotation={onAddAnnotation}
				annotations={canvasAnnotations}
			/>
		)
	}

	if (awaitingRendition) {
		return <CenteredSpinner message="Preparing a preview of this file…" />
	}

	return (
		<AnnotationCanvas
			imageUrl={mediaUrl(selectedVersion.proxyUrl || selectedVersion.url)}
			tool={tool}
			color={color}
			onAddAnnotation={onAddAnnotation}
			annotations={canvasAnnotations}
		/>
	)
}
