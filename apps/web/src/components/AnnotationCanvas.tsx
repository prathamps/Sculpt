"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { AnnotationTool } from "@/types"
import { drawAnnotations } from "@/lib/annotation-drawing"
import { useDrawingSurface } from "@/hooks/useDrawingSurface"
import {
	devicePixelRatio,
	observeElementSize,
	scaleContextToPixelRatio,
} from "@/lib/canvas"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 0.25

interface Point {
	x: number
	y: number
}

interface Annotation {
	id: number
	type: AnnotationTool
	color: string
	points: Point[]
	isHighlighted?: boolean
	dimmed?: boolean
}

interface AnnotationCanvasProps {
	imageUrl: string
	tool: AnnotationTool
	color: string
	annotations: Annotation[]
	onAddAnnotation?: (
		annotation: Omit<Annotation, "id" | "points"> & { points: Point[] }
	) => void
	readOnly?: boolean
}

export function AnnotationCanvas({
	imageUrl,
	tool,
	color,
	annotations,
	onAddAnnotation,
	readOnly = false,
}: AnnotationCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const imageCanvasRef = useRef<HTMLCanvasElement>(null)
	const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
	const previewCanvasRef = useRef<HTMLCanvasElement>(null)

	const [image, setImage] = useState<HTMLImageElement | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const { handlers } = useDrawingSurface({
		previewCanvasRef,
		tool,
		color,
		onCommit: (stroke) => onAddAnnotation?.(stroke),
	})

	const [zoom, setZoom] = useState(1)
	const [pan, setPan] = useState({ x: 0, y: 0 })
	const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
		null
	)
	const isZoomed = zoom !== 1 || pan.x !== 0 || pan.y !== 0

	const clampZoom = (next: number) =>
		Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))))

	const resetView = useCallback(() => {
		setZoom(1)
		setPan({ x: 0, y: 0 })
	}, [])

	const zoomBy = (delta: number) =>
		setZoom((current) => {
			const next = clampZoom(current + delta)
			if (next === 1) setPan({ x: 0, y: 0 })
			return next
		})

	const handleWheel = (e: React.WheelEvent) => {
		if (!e.ctrlKey && !e.metaKey) return
		e.preventDefault()
		zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
	}

	const beginPan = (e: React.MouseEvent) => {
		panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
	}

	const continuePan = (e: React.MouseEvent) => {
		const origin = panStartRef.current
		if (!origin) return
		setPan({
			x: origin.panX + (e.clientX - origin.x),
			y: origin.panY + (e.clientY - origin.y),
		})
	}

	const endPan = () => {
		panStartRef.current = null
	}

	const redrawAll = useCallback(() => {
		if (
			!image ||
			!imageCanvasRef.current ||
			!drawingCanvasRef.current ||
			!containerRef.current
		) {
			return
		}

		const imgCanvas = imageCanvasRef.current
		const drawCanvas = drawingCanvasRef.current
		const previewCanvas = previewCanvasRef.current

		const containerWidth = containerRef.current.clientWidth || 800
		const containerHeight = containerRef.current.clientHeight || 600
		const imgAspectRatio = image.width / image.height
		const containerAspectRatio = containerWidth / containerHeight

		let canvasWidth: number
		let canvasHeight: number

		if (imgAspectRatio > containerAspectRatio) {
			canvasWidth = containerWidth * 0.95
			canvasHeight = canvasWidth / imgAspectRatio
		} else {
			canvasHeight = containerHeight * 0.95
			canvasWidth = canvasHeight * imgAspectRatio
		}

		const canvases = [imgCanvas, drawCanvas]
		if (previewCanvas) canvases.push(previewCanvas)

		const pixelRatio = devicePixelRatio()

		canvases.forEach((canvas) => {
			canvas.width = Math.round(canvasWidth * pixelRatio)
			canvas.height = Math.round(canvasHeight * pixelRatio)
			canvas.style.width = `${canvasWidth}px`
			canvas.style.height = `${canvasHeight}px`
			scaleContextToPixelRatio(canvas, pixelRatio)
		})

		const imgCtx = imgCanvas.getContext("2d")
		if (imgCtx) {
			imgCtx.clearRect(0, 0, canvasWidth, canvasHeight)
			imgCtx.drawImage(image, 0, 0, canvasWidth, canvasHeight)
		}

		const drawCtx = drawCanvas.getContext("2d")
		if (!drawCtx) return

		drawCtx.clearRect(0, 0, canvasWidth, canvasHeight)
		drawAnnotations(drawCtx, annotations, canvasWidth, canvasHeight)
	}, [image, annotations])

	useEffect(() => {
		if (!imageUrl) return

		setIsLoading(true)
		setError(null)

		const img = new Image()
		let cancelled = false
		img.crossOrigin = "anonymous"

		img.onload = () => {
			if (cancelled) return
			setImage(img)
			setIsLoading(false)
		}

		img.onerror = () => {
			if (cancelled) return
			setIsLoading(false)
			setError("Failed to load image")
		}

		img.src = imageUrl

		return () => {
			cancelled = true
			img.onload = null
			img.onerror = null
		}
	}, [imageUrl])

	useEffect(() => {
		resetView()
	}, [imageUrl, resetView])

	useEffect(() => {
		if (!image) return
		redrawAll()
		return observeElementSize(containerRef.current, redrawAll)
	}, [redrawAll, image])

	useEffect(() => {
		if (image) {
			redrawAll()
		}
	}, [annotations, redrawAll, image])

	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-muted/10">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-muted/10">
				<div className="text-center text-muted-foreground">
					<p className="mb-2 text-sm">{error}</p>
					<p className="text-xs">Please try again later</p>
				</div>
			</div>
		)
	}

	const isPanning = panStartRef.current !== null

	return (
		<div
			ref={containerRef}
			onWheel={handleWheel}
			className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-muted/10 shadow-sm"
		>
			<div
				className="relative flex items-center justify-center"
				style={{
					transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
					transformOrigin: "center center",
					transition: isPanning ? "none" : "transform 120ms ease-out",
				}}
			>
				<canvas ref={imageCanvasRef} className="absolute shadow-md" />
				<canvas ref={drawingCanvasRef} className="absolute" />
				<canvas
					ref={previewCanvasRef}
					onMouseDown={
						isZoomed
							? beginPan
							: readOnly
								? undefined
								: handlers.onMouseDown
					}
					onMouseMove={
						isZoomed
							? continuePan
							: readOnly
								? undefined
								: handlers.onMouseMove
					}
					onMouseUp={
						isZoomed ? endPan : readOnly ? undefined : handlers.onMouseUp
					}
					onMouseLeave={
						isZoomed ? endPan : readOnly ? undefined : handlers.onMouseLeave
					}
					onTouchStart={readOnly ? undefined : handlers.onTouchStart}
					onTouchMove={readOnly ? undefined : handlers.onTouchMove}
					onTouchEnd={readOnly ? undefined : handlers.onTouchEnd}
					className={
						isZoomed
							? "absolute cursor-grab active:cursor-grabbing"
							: readOnly
								? "absolute"
								: "absolute cursor-crosshair"
					}
				/>
			</div>

			<div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 p-1 shadow-sm backdrop-blur-sm">
				<button
					type="button"
					onClick={() => zoomBy(-ZOOM_STEP)}
					disabled={zoom <= MIN_ZOOM}
					aria-label="Zoom out"
					className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<ZoomOut className="h-4 w-4" aria-hidden="true" />
				</button>
				<span
					className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground"
					aria-live="polite"
				>
					{Math.round(zoom * 100)}%
				</span>
				<button
					type="button"
					onClick={() => zoomBy(ZOOM_STEP)}
					disabled={zoom >= MAX_ZOOM}
					aria-label="Zoom in"
					className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<ZoomIn className="h-4 w-4" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={resetView}
					disabled={!isZoomed}
					aria-label="Reset zoom to fit"
					className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Maximize2 className="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
		</div>
	)
}
