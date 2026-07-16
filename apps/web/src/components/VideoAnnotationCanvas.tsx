"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { AnnotationTool } from "@/app/project/[projectId]/image/[imageId]/page"
import { formatVideoTime } from "@/lib/utils"
import {
	Loader2,
	Play,
	Pause,
	ChevronLeft,
	ChevronRight,
	Camera,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Point {
	x: number
	y: number
}

interface VideoAnnotation {
	id: number
	type: AnnotationTool
	color: string
	points: Point[]
	t?: number
	isHighlighted?: boolean
}

interface SeekRequest {
	time: number
	nonce: number
}

interface VideoAnnotationCanvasProps {
	videoUrl: string
	tool: AnnotationTool
	color: string
	annotations: VideoAnnotation[]
	onAddAnnotation: (
		annotation: Omit<VideoAnnotation, "id" | "points"> & { points: Point[] }
	) => void
	onTimeChange?: (time: number, duration: number) => void
	seekRequest?: SeekRequest | null
	frameRate?: number
}

// Frame-by-frame video annotation: an HTML5 <video> with overlaid drawing
// canvases. Each annotation is anchored to the video frame it was drawn on and
// only shown when the playhead is on that frame.
export function VideoAnnotationCanvas({
	videoUrl,
	tool,
	color,
	annotations,
	onAddAnnotation,
	onTimeChange,
	seekRequest,
	frameRate = 30,
}: VideoAnnotationCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
	const previewCanvasRef = useRef<HTMLCanvasElement>(null)

	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isPlaying, setIsPlaying] = useState(false)
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(0)
	const [dims, setDims] = useState({ width: 0, height: 0 })

	const isDrawingRef = useRef(false)
	const startPosRef = useRef<Point | null>(null)
	const currentPathRef = useRef<Point[]>([])
	const frameStep = 1 / frameRate

	// Annotations belong to a specific frame; show only those on the current
	// frame (plus any explicitly highlighted ones from comment clicks).
	const sameFrame = useCallback(
		(t: number | undefined) => {
			if (t === undefined || t === null) return true
			return Math.floor(t * frameRate) === Math.floor(currentTime * frameRate)
		},
		[currentTime, frameRate]
	)

	const drawAll = useCallback(() => {
		const canvas = drawingCanvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d")
		if (!ctx) return
		const { width, height } = canvas
		ctx.clearRect(0, 0, width, height)

		const visible = annotations.filter((a) => a.isHighlighted || sameFrame(a.t))

		visible.forEach((annotation) => {
			const { type, color: c, points, isHighlighted } = annotation
			if (!points || points.length === 0) return
			ctx.strokeStyle = c
			ctx.lineWidth = isHighlighted ? 4 : 2
			ctx.lineCap = "round"
			ctx.lineJoin = "round"
			ctx.beginPath()
			if (type === "pencil") {
				ctx.moveTo(points[0].x * width, points[0].y * height)
				points.forEach((p) => ctx.lineTo(p.x * width, p.y * height))
			} else if (type === "rect" && points.length >= 2) {
				const s = points[0]
				const e = points[1]
				ctx.rect(
					s.x * width,
					s.y * height,
					(e.x - s.x) * width,
					(e.y - s.y) * height
				)
			} else if (type === "line" && points.length >= 2) {
				ctx.moveTo(points[0].x * width, points[0].y * height)
				ctx.lineTo(points[1].x * width, points[1].y * height)
			}
			ctx.stroke()
		})
	}, [annotations, sameFrame])

	// Fit the video + canvases into the container preserving aspect ratio.
	const resize = useCallback(() => {
		const video = videoRef.current
		const container = containerRef.current
		if (!video || !container || !video.videoWidth) return

		const containerWidth = container.clientWidth || 800
		const containerHeight = container.clientHeight || 600
		const videoAspect = video.videoWidth / video.videoHeight
		const containerAspect = containerWidth / containerHeight

		let width: number
		let height: number
		if (videoAspect > containerAspect) {
			width = containerWidth * 0.95
			height = width / videoAspect
		} else {
			height = containerHeight * 0.95
			width = height * videoAspect
		}

		;[drawingCanvasRef.current, previewCanvasRef.current].forEach((c) => {
			if (c) {
				c.width = width
				c.height = height
				c.style.width = `${width}px`
				c.style.height = `${height}px`
			}
		})
		video.style.width = `${width}px`
		video.style.height = `${height}px`
		setDims({ width, height })
		drawAll()
	}, [drawAll])

	useEffect(() => {
		setIsLoading(true)
		setError(null)
	}, [videoUrl])

	useEffect(() => {
		drawAll()
	}, [drawAll, dims])

	// React to external seek requests (e.g. clicking a comment timestamp).
	useEffect(() => {
		if (seekRequest && videoRef.current) {
			videoRef.current.pause()
			videoRef.current.currentTime = Math.max(0, seekRequest.time)
			// Abandon any in-progress drawing and clear the preview overlay.
			isDrawingRef.current = false
			startPosRef.current = null
			currentPathRef.current = []
			const preview = previewCanvasRef.current
			const ctx = preview?.getContext("2d")
			if (ctx && preview) ctx.clearRect(0, 0, preview.width, preview.height)
		}
	}, [seekRequest])

	useEffect(() => {
		window.addEventListener("resize", resize)
		return () => window.removeEventListener("resize", resize)
	}, [resize])

	const handleLoadedMetadata = () => {
		const video = videoRef.current
		if (!video) return
		setDuration(video.duration || 0)
		setIsLoading(false)
		resize()
	}

	const handleTimeUpdate = () => {
		const video = videoRef.current
		if (!video) return
		setCurrentTime(video.currentTime)
		onTimeChange?.(video.currentTime, video.duration || 0)
	}

	const togglePlay = () => {
		const video = videoRef.current
		if (!video) return
		if (video.paused) {
			video.play()
			setIsPlaying(true)
		} else {
			video.pause()
			setIsPlaying(false)
		}
	}

	const stepFrame = (dir: 1 | -1) => {
		const video = videoRef.current
		if (!video) return
		video.pause()
		setIsPlaying(false)
		video.currentTime = Math.min(
			Math.max(0, video.currentTime + dir * frameStep),
			video.duration || 0
		)
	}

	const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
		const video = videoRef.current
		if (!video) return
		const t = Number(e.target.value)
		video.currentTime = t
		setCurrentTime(t)
	}

	// --- Drawing -------------------------------------------------------------
	const getRelativePos = (e: React.MouseEvent): Point | null => {
		const canvas = previewCanvasRef.current
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()
		return {
			x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
		}
	}

	const handleMouseDown = (e: React.MouseEvent) => {
		const pos = getRelativePos(e)
		if (!pos) return
		// Pause so the drawing stays anchored to a single frame.
		videoRef.current?.pause()
		setIsPlaying(false)
		isDrawingRef.current = true
		startPosRef.current = pos
		currentPathRef.current = [pos]
	}

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDrawingRef.current) return
		const pos = getRelativePos(e)
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
			ctx.moveTo(currentPathRef.current[0].x * width, currentPathRef.current[0].y * height)
			currentPathRef.current.forEach((p) => ctx.lineTo(p.x * width, p.y * height))
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

	const handleMouseUp = (e: React.MouseEvent) => {
		if (!isDrawingRef.current) return
		isDrawingRef.current = false
		const pos = getRelativePos(e)
		const start = startPosRef.current
		if (!pos || !start) return
		const finalPoints =
			tool === "pencil" ? currentPathRef.current : [start, pos]
		if (finalPoints.length > 0) {
			onAddAnnotation({
				type: tool,
				color,
				points: finalPoints,
				t: videoRef.current?.currentTime ?? currentTime,
			})
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

	// --- Export current annotated frame as PNG -------------------------------
	const downloadFrame = () => {
		const video = videoRef.current
		const draw = drawingCanvasRef.current
		if (!video || !video.videoWidth) return
		const out = document.createElement("canvas")
		out.width = video.videoWidth
		out.height = video.videoHeight
		const ctx = out.getContext("2d")
		if (!ctx) return
		try {
			ctx.drawImage(video, 0, 0, out.width, out.height)
			if (draw) ctx.drawImage(draw, 0, 0, out.width, out.height)
			out.toBlob((blob) => {
				if (!blob) return
				const url = URL.createObjectURL(blob)
				const a = document.createElement("a")
				a.href = url
				a.download = `frame-${currentTime.toFixed(2)}s.png`
				a.click()
				URL.revokeObjectURL(url)
			})
		} catch (err) {
			console.error("Failed to export frame:", err)
		}
	}

	return (
		<div className="flex h-full w-full flex-col">
			<div
				ref={containerRef}
				className="relative flex flex-1 items-center justify-center overflow-hidden bg-black/40"
			>
				{isLoading && (
					<div className="absolute inset-0 z-10 flex items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				)}
				{error ? (
					<div className="text-center text-muted-foreground">
						<p className="text-sm">{error}</p>
					</div>
				) : (
					<div className="relative">
						<video
							ref={videoRef}
							src={videoUrl}
							crossOrigin="anonymous"
							playsInline
							onLoadedMetadata={handleLoadedMetadata}
							onTimeUpdate={handleTimeUpdate}
							onSeeked={() => {
								handleTimeUpdate()
								drawAll()
							}}
							onPlay={() => setIsPlaying(true)}
							onPause={() => setIsPlaying(false)}
							onError={() => {
								setIsLoading(false)
								setError("Failed to load video")
							}}
							className="block rounded-md shadow-md"
						/>
						<canvas
							ref={drawingCanvasRef}
							className="pointer-events-none absolute left-0 top-0"
						/>
						<canvas
							ref={previewCanvasRef}
							onMouseDown={handleMouseDown}
							onMouseMove={handleMouseMove}
							onMouseUp={handleMouseUp}
							onMouseLeave={handleMouseUp}
							className="absolute left-0 top-0 cursor-crosshair"
						/>
					</div>
				)}
			</div>

			{/* Playback controls */}
			<div className="flex items-center gap-2 border-t border-border/40 bg-card px-3 py-2">
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={togglePlay}
					title={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? (
						<Pause className="h-4 w-4" />
					) : (
						<Play className="h-4 w-4" />
					)}
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={() => stepFrame(-1)}
					title="Previous frame"
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={() => stepFrame(1)}
					title="Next frame"
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
				<span className="font-mono text-xs tabular-nums text-muted-foreground">
					{formatVideoTime(currentTime, true)}
				</span>
				<input
					type="range"
					min={0}
					max={duration || 0}
					step={0.01}
					value={currentTime}
					onChange={handleScrub}
					className="h-1 flex-1 cursor-pointer accent-primary"
				/>
				<span className="font-mono text-xs tabular-nums text-muted-foreground">
					{formatVideoTime(duration)}
				</span>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={downloadFrame}
					title="Download annotated frame (PNG)"
				>
					<Camera className="h-4 w-4" />
				</Button>
			</div>
		</div>
	)
}
