"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
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
}

interface AnnotationCanvasProps {
	imageUrl: string
	tool: AnnotationTool
	color: string
	annotations: Annotation[]
	onAddAnnotation: (
		annotation: Omit<Annotation, "id" | "points"> & { points: Point[] }
	) => void
}

export function AnnotationCanvas({
	imageUrl,
	tool,
	color,
	annotations,
	onAddAnnotation,
}: AnnotationCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const imageCanvasRef = useRef<HTMLCanvasElement>(null)
	const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
	const previewCanvasRef = useRef<HTMLCanvasElement>(null)

	const [isDrawing, setIsDrawing] = useState(false)
	const [image, setImage] = useState<HTMLImageElement | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [canvasDimensions, setCanvasDimensions] = useState({
		width: 0,
		height: 0,
	})

	const startPosRef = useRef<Point | null>(null)
	const currentPathRef = useRef<Point[]>([])

	const drawExistingAnnotations = useCallback(
		(ctx: CanvasRenderingContext2D) => {
			annotations.forEach((annotation) => {
				ctx.strokeStyle = annotation.color
				ctx.lineWidth = annotation.isHighlighted ? 4 : 2
				ctx.lineCap = "round"
				ctx.lineJoin = "round"

				ctx.beginPath()

				if (annotation.points.length === 0) return

				// Convert normalized coordinates (0-1) to actual canvas pixels
				const startX = annotation.points[0].x * ctx.canvas.width
				const startY = annotation.points[0].y * ctx.canvas.height
				ctx.moveTo(startX, startY)

				if (annotation.type === "pencil") {
					annotation.points.forEach((p) => {
						ctx.lineTo(p.x * ctx.canvas.width, p.y * ctx.canvas.height)
					})
				} else if (
					(annotation.type === "rect" || annotation.type === "line") &&
					annotation.points.length > 1
				) {
					const endX =
						annotation.points[annotation.points.length - 1].x * ctx.canvas.width
					const endY =
						annotation.points[annotation.points.length - 1].y *
						ctx.canvas.height
					if (annotation.type === "rect") {
						ctx.rect(startX, startY, endX - startX, endY - startY)
					} else {
						ctx.lineTo(endX, endY)
					}
				}
				ctx.stroke()
			})
		},
		[annotations]
	)

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

		// Set canvas dimensions to match the image aspect ratio
		const containerWidth = containerRef.current.clientWidth || 800
		const containerHeight = containerRef.current.clientHeight || 600
		const imgAspectRatio = image.width / image.height
		const containerAspectRatio = containerWidth / containerHeight

		let canvasWidth: number
		let canvasHeight: number

		if (imgAspectRatio > containerAspectRatio) {
			// Image is wider than container
			canvasWidth = containerWidth * 0.95
			canvasHeight = canvasWidth / imgAspectRatio
		} else {
			// Image is taller than container
			canvasHeight = containerHeight * 0.95
			canvasWidth = canvasHeight * imgAspectRatio
		}

		// Set all canvases to the same dimensions
		const canvases = [imgCanvas, drawCanvas]
		if (previewCanvas) canvases.push(previewCanvas)

		canvases.forEach((canvas) => {
			canvas.width = canvasWidth
			canvas.height = canvasHeight
			canvas.style.width = `${canvasWidth}px`
			canvas.style.height = `${canvasHeight}px`
		})

		// Draw image on the image canvas
		const imgCtx = imgCanvas.getContext("2d")
		if (imgCtx) {
			imgCtx.clearRect(0, 0, canvasWidth, canvasHeight)
			imgCtx.drawImage(image, 0, 0, canvasWidth, canvasHeight)
		}

		// Draw all annotations on the drawing canvas
		const drawCtx = drawCanvas.getContext("2d")
		if (!drawCtx) return

		drawCtx.clearRect(0, 0, canvasWidth, canvasHeight)
		annotations.forEach((annotation) => {
			const { type, color, points, isHighlighted } = annotation

			// Set styles for drawing
			drawCtx.strokeStyle = color
			drawCtx.lineWidth = isHighlighted ? 4 : 2 // Make highlighted annotations thicker
			drawCtx.lineCap = "round"
			drawCtx.lineJoin = "round"

			// Remove the glow effect but keep the thicker line width
			drawCtx.shadowBlur = 0
			drawCtx.shadowOffsetX = 0
			drawCtx.shadowOffsetY = 0

			drawCtx.beginPath()

			if (type === "pencil") {
				if (points.length > 0) {
					// Convert normalized coordinates (0-1) to canvas coordinates
					drawCtx.moveTo(points[0].x * canvasWidth, points[0].y * canvasHeight)
					points.forEach((p) => {
						drawCtx.lineTo(p.x * canvasWidth, p.y * canvasHeight)
					})
				}
			} else if (type === "rect" && points.length >= 2) {
				const startPoint = points[0]
				const endPoint = points[1]
				if (startPoint && endPoint) {
					drawCtx.rect(
						startPoint.x * canvasWidth,
						startPoint.y * canvasHeight,
						(endPoint.x - startPoint.x) * canvasWidth,
						(endPoint.y - startPoint.y) * canvasHeight
					)
				}
			} else if (type === "line" && points.length >= 2) {
				const startPoint = points[0]
				const endPoint = points[1]
				if (startPoint && endPoint) {
					drawCtx.moveTo(
						startPoint.x * canvasWidth,
						startPoint.y * canvasHeight
					)
					drawCtx.lineTo(endPoint.x * canvasWidth, endPoint.y * canvasHeight)
				}
			}
			drawCtx.stroke()
		})
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

	// Get position as a percentage of the canvas size (0-1)
	// This ensures coordinates remain consistent when canvas is resized
	const getRelativePos = (e: React.MouseEvent): Point | null => {
		const canvas = previewCanvasRef.current
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()

		// Calculate position relative to the canvas element, not the viewport
		const x = (e.clientX - rect.left) / rect.width
		const y = (e.clientY - rect.top) / rect.height

		// Ensure coordinates are within bounds (0-1)
		return {
			x: Math.max(0, Math.min(1, x)),
			y: Math.max(0, Math.min(1, y)),
		}
	}

	const handleMouseDown = (e: React.MouseEvent) => {
		const pos = getRelativePos(e)
		if (!pos) return
		setIsDrawing(true)
		startPosRef.current = pos
		currentPathRef.current = [pos]
	}

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDrawing) return
		const pos = getRelativePos(e)
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
				currentPathRef.current[0].x * width,
				currentPathRef.current[0].y * height
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

		const pos = getRelativePos(e)
		const startPos = startPosRef.current
		if (!pos || !startPos) return

		let finalPoints: Point[]
		if (tool === "pencil") {
			finalPoints = currentPathRef.current
		} else {
			finalPoints = [startPos, pos]
		}

		if (finalPoints.length > 0) {
			onAddAnnotation({ type: tool, color, points: finalPoints })
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

	// Add touch support for mobile devices
	const handleTouchStart = (e: React.TouchEvent) => {
		e.preventDefault() // Prevent scrolling while drawing
		if (e.touches.length > 0) {
			const touch = e.touches[0]
			const mouseEvent = new MouseEvent("mousedown", {
				clientX: touch.clientX,
				clientY: touch.clientY,
			})
			handleMouseDown(mouseEvent as any)
		}
	}

	const handleTouchMove = (e: React.TouchEvent) => {
		e.preventDefault()
		if (!isDrawing || e.touches.length === 0) return
		const touch = e.touches[0]
		const mouseEvent = new MouseEvent("mousemove", {
			clientX: touch.clientX,
			clientY: touch.clientY,
		})
		handleMouseMove(mouseEvent as any)
	}

	const handleTouchEnd = (e: React.TouchEvent) => {
		e.preventDefault()
		const mouseEvent = new MouseEvent("mouseup")
		handleMouseUp(mouseEvent as any)
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
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				className="absolute cursor-crosshair"
			/>
		</div>
	)
}
