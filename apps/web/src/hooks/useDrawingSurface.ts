"use client"

import { RefObject, useCallback, useRef } from "react"
import type React from "react"
import { AnnotationTool, Point } from "@/types"
import { cssCanvasSize } from "@/lib/canvas"

export interface DrawnStroke {
	type: AnnotationTool
	color: string
	points: Point[]
}

export interface DrawingSurfaceHandlers {
	onMouseDown: (e: React.MouseEvent) => void
	onMouseMove: (e: React.MouseEvent) => void
	onMouseUp: (e: React.MouseEvent) => void
	onMouseLeave: (e: React.MouseEvent) => void
	onTouchStart: (e: React.TouchEvent) => void
	onTouchMove: (e: React.TouchEvent) => void
	onTouchEnd: (e: React.TouchEvent) => void
	onTouchCancel: (e: React.TouchEvent) => void
}

interface UseDrawingSurfaceOptions {
	previewCanvasRef: RefObject<HTMLCanvasElement | null>
	tool: AnnotationTool
	color: string
	onCommit: (stroke: DrawnStroke) => void
	onStrokeStart?: () => void
	measure?: "css" | "raw"
}

export function useDrawingSurface({
	previewCanvasRef,
	tool,
	color,
	onCommit,
	onStrokeStart,
	measure = "css",
}: UseDrawingSurfaceOptions) {
	const isDrawingRef = useRef(false)
	const startPosRef = useRef<Point | null>(null)
	const lastPosRef = useRef<Point | null>(null)
	const currentPathRef = useRef<Point[]>([])

	const surfaceSize = useCallback(
		(canvas: HTMLCanvasElement) =>
			measure === "raw"
				? { width: canvas.width, height: canvas.height }
				: cssCanvasSize(canvas),
		[measure]
	)

	const normalizedPointAt = (clientX: number, clientY: number): Point | null => {
		const canvas = previewCanvasRef.current
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()
		return {
			x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
		}
	}

	const clearPreview = useCallback(() => {
		const canvas = previewCanvasRef.current
		const ctx = canvas?.getContext("2d")
		if (!ctx || !canvas) return
		const { width, height } = surfaceSize(canvas)
		ctx.clearRect(0, 0, width, height)
	}, [previewCanvasRef, surfaceSize])

	const beginStroke = (pos: Point | null) => {
		if (!pos) return
		onStrokeStart?.()
		isDrawingRef.current = true
		startPosRef.current = pos
		lastPosRef.current = pos
		currentPathRef.current = [pos]
	}

	const extendStroke = (pos: Point | null) => {
		if (!isDrawingRef.current || !pos) return
		lastPosRef.current = pos

		const canvas = previewCanvasRef.current
		const ctx = canvas?.getContext("2d")
		if (!ctx || !canvas) return
		const { width, height } = surfaceSize(canvas)
		ctx.clearRect(0, 0, width, height)
		ctx.strokeStyle = color
		ctx.lineWidth = 2
		ctx.lineCap = "round"
		ctx.lineJoin = "round"
		ctx.beginPath()

		if (tool === "pencil") {
			currentPathRef.current.push(pos)
			const first = currentPathRef.current[0]
			if (!first) return
			ctx.moveTo(first.x * width, first.y * height)
			currentPathRef.current.forEach((p) =>
				ctx.lineTo(p.x * width, p.y * height)
			)
		} else {
			const start = startPosRef.current
			if (!start) return
			if (tool === "rect") {
				ctx.rect(
					start.x * width,
					start.y * height,
					(pos.x - start.x) * width,
					(pos.y - start.y) * height
				)
			} else if (tool === "line") {
				ctx.moveTo(start.x * width, start.y * height)
				ctx.lineTo(pos.x * width, pos.y * height)
			}
		}
		ctx.stroke()
	}

	const finishStroke = (pos: Point | null) => {
		if (!isDrawingRef.current) return
		isDrawingRef.current = false

		const end = pos ?? lastPosRef.current
		const start = startPosRef.current
		if (end && start) {
			const points =
				tool === "pencil" ? currentPathRef.current : [start, end]
			if (points.length > 0) {
				onCommit({ type: tool, color, points })
			}
		}

		clearPreview()
		startPosRef.current = null
		lastPosRef.current = null
		currentPathRef.current = []
	}

	const cancelStroke = useCallback(() => {
		isDrawingRef.current = false
		startPosRef.current = null
		lastPosRef.current = null
		currentPathRef.current = []
		clearPreview()
	}, [clearPreview])

	const pointFromTouch = (touch: React.Touch | undefined): Point | null =>
		touch ? normalizedPointAt(touch.clientX, touch.clientY) : null

	const handlers: DrawingSurfaceHandlers = {
		onMouseDown: (e) => beginStroke(normalizedPointAt(e.clientX, e.clientY)),
		onMouseMove: (e) => extendStroke(normalizedPointAt(e.clientX, e.clientY)),
		onMouseUp: (e) => finishStroke(normalizedPointAt(e.clientX, e.clientY)),
		onMouseLeave: (e) => finishStroke(normalizedPointAt(e.clientX, e.clientY)),
		onTouchStart: (e) => {
			e.preventDefault()
			beginStroke(pointFromTouch(e.touches[0]))
		},
		onTouchMove: (e) => {
			if (!isDrawingRef.current) return
			e.preventDefault()
			extendStroke(pointFromTouch(e.touches[0]))
		},
		onTouchEnd: (e) => {
			if (!isDrawingRef.current) return
			e.preventDefault()
			finishStroke(pointFromTouch(e.changedTouches[0]))
		},
		onTouchCancel: (e) => {
			if (!isDrawingRef.current) return
			e.preventDefault()
			finishStroke(pointFromTouch(e.changedTouches[0]))
		},
	}

	return { handlers, cancelStroke, isDrawingRef }
}
