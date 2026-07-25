"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
import { drawAnnotations } from "@/lib/annotation-drawing"
import { Loader2 } from "lucide-react"

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

	const [isDrawing, setIsDrawing] = useState(false)
	const [image, setImage] = useState<HTMLImageElement | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const startPosRef = useRef<Point | null>(null)
	const currentPathRef = useRef<Point[]>([])

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

		canvases.forEach((canvas) => {
			canvas.width = canvasWidth
			canvas.height = canvasHeight
			canvas.style.width = `${canvasWidth}px`
			canvas.style.height = `${canvasHeight}px`
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
		img.crossOrigin = "anonymous"
		img.src = imageUrl

		img.onload = () => {
			setImage(img)
			setIsLoading(false)
		}

		img.onerror = () => {
			setIsLoading(false)
			setError("Failed to load image")
		}
	}, [imageUrl])

	useEffect(() => {
		if (image) {
			redrawAll()
			window.addEventListener("resize", redrawAll)
			return () => window.removeEventListener("resize", redrawAll)
		}
	}, [redrawAll, image])

	useEffect(() => {
		if (image) {
			redrawAll()
		}
	}, [annotations, redrawAll, image])

	const getNormalizedCanvasPos = (e: React.MouseEvent): Point | null => {
		const canvas = previewCanvasRef.current
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()

		const x = (e.clientX - rect.left) / rect.width
		const y = (e.clientY - rect.top) / rect.height

		return {
			x: Math.max(0, Math.min(1, x)),
			y: Math.max(0, Math.min(1, y)),
		}
	}

	const handleMouseDown = (e: React.MouseEvent) => {
		if (readOnly) return
		const pos = getNormalizedCanvasPos(e)
		if (!pos) return
		setIsDrawing(true)
		startPosRef.current = pos
		currentPathRef.current = [pos]
	}

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDrawing) return
		const pos = getNormalizedCanvasPos(e)
		if (!pos) return

		const previewCtx = previewCanvasRef.current?.getContext("2d")
		if (!previewCtx || !previewCanvasRef.current) return
		const { width, height } = previewCanvasRef.current
		previewCtx.clearRect(0, 0, width, height)

		previewCtx.strokeStyle = color
		previewCtx.lineWidth = 2
		previewCtx.lineCap = "round"
		previewCtx.lineJoin = "round"

		if (tool === "pencil") {
			currentPathRef.current.push(pos)
			previewCtx.beginPath()
			previewCtx.moveTo(
				currentPathRef.current[0]?.x * width,
				currentPathRef.current[0]?.y * height
			)
			currentPathRef.current.forEach((p) => {
				previewCtx.lineTo(p.x * width, p.y * height)
			})
			previewCtx.stroke()
		} else {
			const startPos = startPosRef.current
			if (!startPos) return
			previewCtx.beginPath()
			if (tool === "rect") {
				previewCtx.rect(
					startPos.x * width,
					startPos.y * height,
					(pos.x - startPos.x) * width,
					(pos.y - startPos.y) * height
				)
			} else if (tool === "line") {
				previewCtx.moveTo(startPos.x * width, startPos.y * height)
				previewCtx.lineTo(pos.x * width, pos.y * height)
			}
			previewCtx.stroke()
		}
	}

	const handleMouseUp = (e: React.MouseEvent) => {
		if (!isDrawing) return
		setIsDrawing(false)

		const pos = getNormalizedCanvasPos(e)
		const startPos = startPosRef.current
		if (!pos || !startPos) return

		let finalPoints: Point[]
		if (tool === "pencil") {
			finalPoints = currentPathRef.current
		} else {
			finalPoints = [startPos, pos]
		}

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

	const handleTouchStart = (e: React.TouchEvent) => {
		e.preventDefault()
		if (e.touches.length > 0) {
			const touch = e.touches[0]
			const mouseEvent = new MouseEvent("mousedown", {
				clientX: touch?.clientX,
				clientY: touch?.clientY,
			})
			handleMouseDown(mouseEvent as unknown as React.MouseEvent)
		}
	}

	const handleTouchMove = (e: React.TouchEvent) => {
		e.preventDefault()
		if (!isDrawing || e.touches.length === 0) return
		const touch = e.touches[0]
		const mouseEvent = new MouseEvent("mousemove", {
			clientX: touch?.clientX,
			clientY: touch?.clientY,
		})
		handleMouseMove(mouseEvent as unknown as React.MouseEvent)
	}

	const handleTouchEnd = (e: React.TouchEvent) => {
		e.preventDefault()
		const mouseEvent = new MouseEvent("mouseup")
		handleMouseUp(mouseEvent as unknown as React.MouseEvent)
	}

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

	return (
		<div
			ref={containerRef}
			className="relative flex h-full w-full items-center justify-center bg-muted/10 rounded-md shadow-sm"
		>
			<canvas ref={imageCanvasRef} className="absolute shadow-md" />
			<canvas ref={drawingCanvasRef} className="absolute" />
			<canvas
				ref={previewCanvasRef}
				onMouseDown={readOnly ? undefined : handleMouseDown}
				onMouseMove={readOnly ? undefined : handleMouseMove}
				onMouseUp={readOnly ? undefined : handleMouseUp}
				onMouseLeave={readOnly ? undefined : handleMouseUp}
				onTouchStart={readOnly ? undefined : handleTouchStart}
				onTouchMove={readOnly ? undefined : handleTouchMove}
				onTouchEnd={readOnly ? undefined : handleTouchEnd}
				className={readOnly ? "absolute" : "absolute cursor-crosshair"}
			/>
		</div>
	)
}
