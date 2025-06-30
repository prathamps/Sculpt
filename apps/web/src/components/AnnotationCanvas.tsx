"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { AnnotationTool } from "@/app/projects/[projectId]/page"

interface Point {
	x: number
	y: number
}

interface Annotation {
	id: number
	type: AnnotationTool
	color: string
	points: Point[]
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
	const startPosRef = useRef<Point | null>(null)
	const currentPathRef = useRef<Point[]>([])

	const drawExistingAnnotations = useCallback(
		(ctx: CanvasRenderingContext2D) => {
			annotations.forEach((annotation) => {
				ctx.strokeStyle = annotation.color
				ctx.lineWidth = 2
				ctx.lineCap = "round"
				ctx.lineJoin = "round"
				ctx.beginPath()

				if (annotation.points.length === 0) return

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
		if (!image || !containerRef.current) return
		const container = containerRef.current
		const imageCtx = imageCanvasRef.current?.getContext("2d")
		const drawingCtx = drawingCanvasRef.current?.getContext("2d")

		if (!imageCtx || !drawingCtx) return

		const { clientWidth: cW, clientHeight: cH } = container
		const iAR = image.width / image.height
		const cAR = cW / cH

		let canvasWidth, canvasHeight
		if (iAR > cAR) {
			canvasWidth = cW
			canvasHeight = cW / iAR
		} else {
			canvasHeight = cH
			canvasWidth = cH * iAR
		}

		;[imageCanvasRef, drawingCanvasRef, previewCanvasRef].forEach((ref) => {
			if (ref.current) {
				ref.current.width = canvasWidth
				ref.current.height = canvasHeight
			}
		})

		imageCtx.drawImage(image, 0, 0, canvasWidth, canvasHeight)
		drawingCtx.clearRect(0, 0, canvasWidth, canvasHeight)
		drawExistingAnnotations(drawingCtx)
	}, [image, drawExistingAnnotations])

	useEffect(() => {
		const img = new Image()
		img.crossOrigin = "anonymous"
		img.src = imageUrl
		img.onload = () => setImage(img)
	}, [imageUrl])

	useEffect(() => {
		redrawAll()
		window.addEventListener("resize", redrawAll)
		return () => window.removeEventListener("resize", redrawAll)
	}, [redrawAll])

	const getRelativePos = (e: React.MouseEvent): Point | null => {
		const canvas = previewCanvasRef.current
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()
		return {
			x: (e.clientX - rect.left) / canvas.width,
			y: (e.clientY - rect.top) / canvas.height,
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
		if (!previewCtx) return
		const { width, height } = previewCtx.canvas
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
		previewCtx?.clearRect(
			0,
			0,
			previewCtx.canvas.width,
			previewCtx.canvas.height
		)
		startPosRef.current = null
		currentPathRef.current = []
	}

	return (
		<div
			ref={containerRef}
			className="relative flex h-full w-full items-center justify-center"
		>
			<canvas ref={imageCanvasRef} className="absolute" />
			<canvas ref={drawingCanvasRef} className="absolute" />
			<canvas
				ref={previewCanvasRef}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				className="absolute cursor-crosshair"
			/>
		</div>
	)
}
