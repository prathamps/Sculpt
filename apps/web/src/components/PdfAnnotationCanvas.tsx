"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import type {
	PDFDocumentProxy,
	PDFDocumentLoadingTask,
	RenderTask,
} from "pdfjs-dist"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
import { loadPdfjs } from "@/lib/pdf"
import { drawAnnotations } from "@/lib/annotation-drawing"
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Point {
	x: number
	y: number
}

interface PdfAnnotation {
	id: number
	type: AnnotationTool
	color: string
	points: Point[]
	isHighlighted?: boolean
	dimmed?: boolean
}

interface PdfAnnotationCanvasProps {
	pdfUrl: string
	pageNumber: number
	onPageChange: (page: number) => void
	onDocumentLoaded?: (numPages: number) => void
	tool: AnnotationTool
	color: string
	annotations: PdfAnnotation[]
	onAddAnnotation?: (
		annotation: Omit<PdfAnnotation, "id" | "points"> & { points: Point[] }
	) => void
	canDraw?: boolean
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

export function PdfAnnotationCanvas({
	pdfUrl,
	pageNumber,
	onPageChange,
	onDocumentLoaded,
	tool,
	color,
	annotations,
	onAddAnnotation,
	canDraw = true,
}: PdfAnnotationCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const pageCanvasRef = useRef<HTMLCanvasElement>(null)
	const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
	const previewCanvasRef = useRef<HTMLCanvasElement>(null)
	const renderTaskRef = useRef<RenderTask | null>(null)

	const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
	const [numPages, setNumPages] = useState(0)
	const [zoom, setZoom] = useState(1)
	const [pageInput, setPageInput] = useState(String(pageNumber))
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [resizeNonce, setResizeNonce] = useState(0)

	const isDrawingRef = useRef(false)
	const startPosRef = useRef<Point | null>(null)
	const currentPathRef = useRef<Point[]>([])

	useEffect(() => setPageInput(String(pageNumber)), [pageNumber])

	useEffect(() => {
		let cancelled = false
		let loadingTask: PDFDocumentLoadingTask | null = null
		setIsLoading(true)
		setError(null)
		setPdfDocument(null)
		;(async () => {
			try {
				const pdfjs = await loadPdfjs()
				if (cancelled) return
				loadingTask = pdfjs.getDocument({ url: pdfUrl })
				const doc = await loadingTask.promise
				if (cancelled) return
				setPdfDocument(doc)
				setNumPages(doc.numPages)
				onDocumentLoaded?.(doc.numPages)
			} catch (err) {
				console.error("Failed to load PDF:", err)
				if (!cancelled) {
					setError("Failed to load PDF")
					setIsLoading(false)
				}
			}
		})()
		return () => {
			cancelled = true
			loadingTask?.destroy().catch((): void => undefined)
		}
	}, [pdfUrl])

	const redrawAnnotations = useCallback(() => {
		const canvas = drawingCanvasRef.current
		const ctx = canvas?.getContext("2d")
		if (!ctx || !canvas) return
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		drawAnnotations(ctx, annotations, canvas.width, canvas.height)
	}, [annotations])

	useEffect(() => {
		if (!pdfDocument) return
		let cancelled = false
		;(async () => {
			try {
				setIsLoading(true)
				const page = await pdfDocument.getPage(pageNumber)
				if (cancelled) return

				const container = containerRef.current
				const baseViewport = page.getViewport({ scale: 1 })
				const availableWidth = (container?.clientWidth || 800) - 32
				const fitScale = Math.min(availableWidth / baseViewport.width, 2)
				const cssScale = fitScale * zoom
				const dpr = window.devicePixelRatio || 1
				const viewport = page.getViewport({ scale: cssScale * dpr })
				const cssWidth = viewport.width / dpr
				const cssHeight = viewport.height / dpr

				const pageCanvas = pageCanvasRef.current
				if (!pageCanvas) return
				const canvases = [
					pageCanvas,
					drawingCanvasRef.current,
					previewCanvasRef.current,
				]
				canvases.forEach((canvas) => {
					if (!canvas) return
					canvas.width = viewport.width
					canvas.height = viewport.height
					canvas.style.width = `${cssWidth}px`
					canvas.style.height = `${cssHeight}px`
				})

				const ctx = pageCanvas.getContext("2d")
				if (!ctx) return
				renderTaskRef.current?.cancel()
				const task = page.render({
					canvasContext: ctx,
					canvas: pageCanvas,
					viewport,
				})
				renderTaskRef.current = task
				await task.promise
				if (cancelled) return
				redrawAnnotations()
				setIsLoading(false)
			} catch (err) {
				if ((err as Error)?.name !== "RenderingCancelledException") {
					console.error("Failed to render PDF page:", err)
					if (!cancelled) {
						setError("Failed to render PDF page")
						setIsLoading(false)
					}
				}
			}
		})()
		return () => {
			cancelled = true
		}
	}, [pdfDocument, pageNumber, zoom, resizeNonce, redrawAnnotations])

	useEffect(() => {
		redrawAnnotations()
	}, [redrawAnnotations])

	useEffect(() => {
		const onResize = () => setResizeNonce((n) => n + 1)
		window.addEventListener("resize", onResize)
		return () => window.removeEventListener("resize", onResize)
	}, [])

	const goToPage = (page: number) => {
		if (!numPages) return
		onPageChange(Math.min(Math.max(1, Math.round(page)), numPages))
	}

	const commitPageInput = () => {
		const parsed = Number(pageInput)
		if (Number.isFinite(parsed)) goToPage(parsed)
		else setPageInput(String(pageNumber))
	}

	const getNormalizedPos = (clientX: number, clientY: number): Point | null => {
		const canvas = previewCanvasRef.current
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()
		return {
			x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
		}
	}

	const startDrawing = (clientX: number, clientY: number) => {
		const pos = getNormalizedPos(clientX, clientY)
		if (!pos) return
		isDrawingRef.current = true
		startPosRef.current = pos
		currentPathRef.current = [pos]
	}

	const continueDrawing = (clientX: number, clientY: number) => {
		if (!isDrawingRef.current) return
		const pos = getNormalizedPos(clientX, clientY)
		if (!pos) return
		const canvas = previewCanvasRef.current
		const ctx = canvas?.getContext("2d")
		if (!ctx || !canvas) return
		const { width, height } = canvas
		ctx.clearRect(0, 0, width, height)
		ctx.strokeStyle = color
		ctx.lineWidth = 2
		ctx.lineCap = "round"
		ctx.lineJoin = "round"
		ctx.beginPath()
		if (tool === "pencil") {
			currentPathRef.current.push(pos)
			ctx.moveTo(
				currentPathRef.current[0].x * width,
				currentPathRef.current[0].y * height
			)
			currentPathRef.current.forEach((p) =>
				ctx.lineTo(p.x * width, p.y * height)
			)
		} else {
			const s = startPosRef.current
			if (!s) return
			if (tool === "rect") {
				ctx.rect(
					s.x * width,
					s.y * height,
					(pos.x - s.x) * width,
					(pos.y - s.y) * height
				)
			} else if (tool === "line") {
				ctx.moveTo(s.x * width, s.y * height)
				ctx.lineTo(pos.x * width, pos.y * height)
			}
		}
		ctx.stroke()
	}

	const finishDrawing = (clientX: number, clientY: number) => {
		if (!isDrawingRef.current) return
		isDrawingRef.current = false
		const pos = getNormalizedPos(clientX, clientY)
		const start = startPosRef.current
		if (!pos || !start) return
		const finalPoints =
			tool === "pencil" ? currentPathRef.current : [start, pos]
		if (finalPoints.length > 0) {
			onAddAnnotation?.({ type: tool, color, points: finalPoints })
		}
		const previewCtx = previewCanvasRef.current?.getContext("2d")
		if (previewCtx && previewCanvasRef.current) {
			previewCtx.clearRect(
				0,
				0,
				previewCanvasRef.current.width,
				previewCanvasRef.current.height
			)
		}
		startPosRef.current = null
		currentPathRef.current = []
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

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex flex-wrap items-center justify-center gap-1 border-b border-border/40 bg-card px-3 py-1.5">
				<Button
					size="icon"
					variant="ghost"
					className="h-7 w-7"
					onClick={() => goToPage(pageNumber - 1)}
					disabled={pageNumber <= 1}
					aria-label="Previous page"
				>
					<ChevronLeft className="h-4 w-4" aria-hidden="true" />
				</Button>
				<div className="flex items-center gap-1 text-xs text-muted-foreground">
					<Input
						className="h-7 w-12 text-center text-xs"
						value={pageInput}
						onChange={(e) => setPageInput(e.target.value)}
						onBlur={commitPageInput}
						onKeyDown={(e) => {
							if (e.key === "Enter") commitPageInput()
							e.stopPropagation()
						}}
						inputMode="numeric"
						aria-label="Current page number"
					/>
					<span>/ {numPages || "…"}</span>
				</div>
				<Button
					size="icon"
					variant="ghost"
					className="h-7 w-7"
					onClick={() => goToPage(pageNumber + 1)}
					disabled={numPages > 0 && pageNumber >= numPages}
					aria-label="Next page"
				>
					<ChevronRight className="h-4 w-4" aria-hidden="true" />
				</Button>
				<div className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
				<Button
					size="icon"
					variant="ghost"
					className="h-7 w-7"
					onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.25))}
					disabled={zoom <= MIN_ZOOM}
					aria-label="Zoom out"
				>
					<ZoomOut className="h-4 w-4" aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 font-mono text-xs tabular-nums"
					onClick={() => setZoom(1)}
					aria-label="Reset zoom to fit width"
				>
					{Math.round(zoom * 100)}%
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="h-7 w-7"
					onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.25))}
					disabled={zoom >= MAX_ZOOM}
					aria-label="Zoom in"
				>
					<ZoomIn className="h-4 w-4" aria-hidden="true" />
				</Button>
			</div>
			<div
				ref={containerRef}
				className="relative flex-1 overflow-auto bg-muted/10 p-4"
			>
				{isLoading && (
					<div className="absolute inset-0 z-10 flex items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				)}
				<div className="relative mx-auto w-fit">
					<canvas ref={pageCanvasRef} className="block shadow-md" />
					<canvas
						ref={drawingCanvasRef}
						className="pointer-events-none absolute left-0 top-0"
					/>
					<canvas
						ref={previewCanvasRef}
						onMouseDown={
							canDraw ? (e) => startDrawing(e.clientX, e.clientY) : undefined
						}
						onMouseMove={
							canDraw ? (e) => continueDrawing(e.clientX, e.clientY) : undefined
						}
						onMouseUp={
							canDraw ? (e) => finishDrawing(e.clientX, e.clientY) : undefined
						}
						onMouseLeave={
							canDraw ? (e) => finishDrawing(e.clientX, e.clientY) : undefined
						}
						className={
							canDraw
								? "absolute left-0 top-0 cursor-crosshair"
								: "pointer-events-none absolute left-0 top-0"
						}
					/>
				</div>
			</div>
		</div>
	)
}
