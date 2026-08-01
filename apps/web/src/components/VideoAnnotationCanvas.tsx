"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { AnnotationTool } from "@/types"
import { cn, formatVideoTime, isEditableTarget } from "@/lib/utils"
import { drawAnnotations } from "@/lib/annotation-drawing"
import { useDrawingSurface } from "@/hooks/useDrawingSurface"
import {
	devicePixelRatio,
	observeElementSize,
	scaleContextToPixelRatio,
	cssCanvasSize,
} from "@/lib/canvas"

import { isAnnotationVisibleAt } from "@/lib/annotation-visibility"
import { Scrubber, ScrubberMarker, ScrubberPeer } from "./Scrubber"
import {
	Loader2,
	Play,
	Pause,
	ChevronLeft,
	ChevronRight,
	Camera,
	Repeat,
	Volume2,
	VolumeX,
	Maximize,
	Minimize,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

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
	tEnd?: number
	isHighlighted?: boolean
	dimmed?: boolean
	pinned?: boolean
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
	onPlayStateChange?: (isPlaying: boolean) => void
	seekRequest?: SeekRequest | null
	frameRate?: number
	markers?: ScrubberMarker[]
	peers?: ScrubberPeer[]
	composingRange?: { start: number; end: number } | null
	onSelectComment?: (commentId: string) => void
	initialDuration?: number | null
	canDraw?: boolean
	enableShortcuts?: boolean
}

const PLAYHEAD_PUBLISH_INTERVAL_SECONDS = 0.1

export function VideoAnnotationCanvas({
	videoUrl,
	tool,
	color,
	annotations,
	onAddAnnotation,
	onTimeChange,
	onPlayStateChange,
	seekRequest,
	frameRate = 30,
	markers = [],
	peers = [],
	composingRange = null,
	onSelectComment,
	initialDuration = null,
	canDraw = true,
	enableShortcuts = true,
}: VideoAnnotationCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
	const previewCanvasRef = useRef<HTMLCanvasElement>(null)

	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isPlaying, setIsPlaying] = useState(false)
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(initialDuration ?? 0)
	const [buffered, setBuffered] = useState<{ start: number; end: number }[]>(
		[]
	)
	const [dims, setDims] = useState({ width: 0, height: 0 })
	const [playbackRate, setPlaybackRate] = useState(1)
	const [isLooping, setIsLooping] = useState(false)
	const [isMuted, setIsMuted] = useState(false)
	const [volume, setVolume] = useState(1)
	const [isFullscreen, setIsFullscreen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)

	const playheadRef = useRef(0)
	const frameStep = 1 / frameRate

	const setPlaying = useCallback(
		(playing: boolean) => {
			setIsPlaying(playing)
			onPlayStateChange?.(playing)
		},
		[onPlayStateChange]
	)

	const { handlers, cancelStroke } = useDrawingSurface({
		previewCanvasRef,
		tool,
		color,
		onStrokeStart: () => {
			videoRef.current?.pause()
			setPlaying(false)
		},
		onCommit: (stroke) =>
			onAddAnnotation({
				...stroke,
				t: videoRef.current?.currentTime ?? playheadRef.current,
			}),
	})

	const drawAll = useCallback(() => {
		const canvas = drawingCanvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d")
		if (!ctx) return
		const { width, height } = cssCanvasSize(canvas)
		ctx.clearRect(0, 0, width, height)
		const visible = annotations.filter((a) =>
			isAnnotationVisibleAt(a, playheadRef.current)
		)
		drawAnnotations(ctx, visible, width, height)
	}, [annotations])

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

		const pixelRatio = devicePixelRatio()

		;[drawingCanvasRef.current, previewCanvasRef.current].forEach((c) => {
			if (c) {
				c.width = Math.round(width * pixelRatio)
				c.height = Math.round(height * pixelRatio)
				c.style.width = `${width}px`
				c.style.height = `${height}px`
				scaleContextToPixelRatio(c, pixelRatio)
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
		setBuffered([])
	}, [videoUrl])

	useEffect(() => {
		drawAll()
	}, [drawAll, dims])

	useEffect(() => {
		if (!isPlaying) return
		let raf = 0
		let lastPublishedTime = -1
		const tick = () => {
			const video = videoRef.current
			if (video) {
				playheadRef.current = video.currentTime
				if (
					Math.abs(video.currentTime - lastPublishedTime) >=
					PLAYHEAD_PUBLISH_INTERVAL_SECONDS
				) {
					lastPublishedTime = video.currentTime
					setCurrentTime(video.currentTime)
				}
				drawAll()
			}
			raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [isPlaying, drawAll])

	useEffect(() => {
		if (seekRequest && videoRef.current) {
			videoRef.current.pause()
			videoRef.current.currentTime = Math.max(0, seekRequest.time)
			playheadRef.current = Math.max(0, seekRequest.time)
			setCurrentTime(playheadRef.current)
			cancelStroke()
		}
	}, [seekRequest, cancelStroke])

	useEffect(
		() => observeElementSize(containerRef.current, resize),
		[resize]
	)

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
		playheadRef.current = video.currentTime
		setCurrentTime(video.currentTime)
		onTimeChange?.(video.currentTime, video.duration || 0)
	}

	const handleProgress = () => {
		const video = videoRef.current
		if (!video) return
		const ranges: { start: number; end: number }[] = []
		for (let i = 0; i < video.buffered.length; i++) {
			ranges.push({ start: video.buffered.start(i), end: video.buffered.end(i) })
		}
		setBuffered(ranges)
	}

	const togglePlay = useCallback(() => {
		const video = videoRef.current
		if (!video) return
		if (video.paused) {
			video.play()
			setPlaying(true)
		} else {
			video.pause()
			setPlaying(false)
		}
	}, [setPlaying])

	const seekTo = useCallback(
		(t: number) => {
			const video = videoRef.current
			if (!video) return
			video.currentTime = Math.max(0, Math.min(t, video.duration || t))
			playheadRef.current = video.currentTime
			setCurrentTime(video.currentTime)
			onTimeChange?.(video.currentTime, video.duration || 0)
			drawAll()
		},
		[onTimeChange, drawAll]
	)

	const stepFrame = useCallback(
		(dir: 1 | -1) => {
			const video = videoRef.current
			if (!video) return
			video.pause()
			setPlaying(false)
			seekTo(video.currentTime + dir * frameStep)
		},
		[frameStep, seekTo, setPlaying]
	)

	useEffect(() => {
		const video = videoRef.current
		if (!video) return
		video.playbackRate = playbackRate
		video.loop = isLooping
		video.muted = isMuted
		video.volume = volume
	}, [playbackRate, isLooping, isMuted, volume, videoUrl])

	const toggleFullscreen = useCallback(() => {
		const root = rootRef.current
		if (!root) return
		if (document.fullscreenElement) {
			void document.exitFullscreen()
		} else {
			void root.requestFullscreen()
		}
	}, [])

	useEffect(() => {
		const onFullscreenChange = () =>
			setIsFullscreen(document.fullscreenElement === rootRef.current)
		document.addEventListener("fullscreenchange", onFullscreenChange)
		return () =>
			document.removeEventListener("fullscreenchange", onFullscreenChange)
	}, [])

	useEffect(() => {
		if (!enableShortcuts) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (isEditableTarget(e.target)) return
			const video = videoRef.current
			if (!video) return
			switch (e.key) {
				case " ":
					e.preventDefault()
					togglePlay()
					break
				case "ArrowLeft":
					e.preventDefault()
					if (e.shiftKey) stepFrame(-1)
					else seekTo(video.currentTime - 5)
					break
				case "ArrowRight":
					e.preventDefault()
					if (e.shiftKey) stepFrame(1)
					else seekTo(video.currentTime + 5)
					break
				case ",":
					stepFrame(-1)
					break
				case ".":
					stepFrame(1)
					break
				case "Home":
					e.preventDefault()
					seekTo(0)
					break
				case "End":
					e.preventDefault()
					seekTo(video.duration || 0)
					break
				case "m":
				case "M":
					setIsMuted((muted) => !muted)
					break
				case "l":
				case "L":
					setIsLooping((looping) => !looping)
					break
				case "f":
				case "F":
					toggleFullscreen()
					break
			}
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [enableShortcuts, seekTo, stepFrame, togglePlay, toggleFullscreen])

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
		<div ref={rootRef} className="flex h-full w-full flex-col bg-background">
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
							onProgress={handleProgress}
							onSeeked={() => {
								handleTimeUpdate()
								drawAll()
							}}
							onPlay={() => setPlaying(true)}
							onPause={() => setPlaying(false)}
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
							onMouseDown={canDraw ? handlers.onMouseDown : undefined}
							onMouseMove={canDraw ? handlers.onMouseMove : undefined}
							onMouseUp={canDraw ? handlers.onMouseUp : undefined}
							onMouseLeave={canDraw ? handlers.onMouseLeave : undefined}
							onTouchStart={canDraw ? handlers.onTouchStart : undefined}
							onTouchMove={canDraw ? handlers.onTouchMove : undefined}
							onTouchEnd={canDraw ? handlers.onTouchEnd : undefined}
							onTouchCancel={canDraw ? handlers.onTouchCancel : undefined}
							className={
								canDraw
									? "absolute left-0 top-0 cursor-crosshair"
									: "pointer-events-none absolute left-0 top-0"
							}
						/>
					</div>
				)}
			</div>

			<div className="flex items-end gap-2 border-t border-border/40 bg-card px-3 py-2">
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={togglePlay}
					aria-label={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? (
						<Pause className="h-4 w-4" aria-hidden="true" />
					) : (
						<Play className="h-4 w-4" aria-hidden="true" />
					)}
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={() => stepFrame(-1)}
					aria-label="Previous frame"
				>
					<ChevronLeft className="h-4 w-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={() => stepFrame(1)}
					aria-label="Next frame"
				>
					<ChevronRight className="h-4 w-4" aria-hidden="true" />
				</Button>
				<span className="pb-1 font-mono text-xs tabular-nums text-muted-foreground">
					{formatVideoTime(currentTime, true)}
				</span>
				<Scrubber
					currentTime={currentTime}
					duration={duration}
					buffered={buffered}
					markers={markers}
					peers={peers}
					composingRange={composingRange}
					frameStep={frameStep}
					onSeek={seekTo}
					onSelectComment={onSelectComment}
				/>
				<span className="pb-1 font-mono text-xs tabular-nums text-muted-foreground">
					{formatVideoTime(duration)}
				</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							size="sm"
							variant="ghost"
							className="h-8 px-1.5 font-mono text-xs tabular-nums"
							aria-label={`Playback speed ${playbackRate}x`}
						>
							{playbackRate}×
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-[80px]">
						{PLAYBACK_RATES.map((rate) => (
							<DropdownMenuItem
								key={rate}
								className={cn(
									"justify-center font-mono text-xs tabular-nums",
									rate === playbackRate && "text-primary"
								)}
								onClick={() => setPlaybackRate(rate)}
							>
								{rate}×
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					size="icon"
					variant="ghost"
					className={cn("h-8 w-8", isLooping && "text-primary")}
					onClick={() => setIsLooping((looping) => !looping)}
					aria-label="Loop playback"
					aria-pressed={isLooping}
				>
					<Repeat className="h-4 w-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={() => setIsMuted((muted) => !muted)}
					aria-label={isMuted ? "Unmute" : "Mute"}
					aria-pressed={isMuted}
				>
					{isMuted || volume === 0 ? (
						<VolumeX className="h-4 w-4" aria-hidden="true" />
					) : (
						<Volume2 className="h-4 w-4" aria-hidden="true" />
					)}
				</Button>
				<input
					type="range"
					min={0}
					max={1}
					step={0.05}
					value={isMuted ? 0 : volume}
					onChange={(e) => {
						const next = Number(e.target.value)
						setVolume(next)
						setIsMuted(next === 0)
					}}
					aria-label="Volume"
					className="mb-3 hidden w-16 accent-primary sm:block"
				/>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={downloadFrame}
					aria-label="Download annotated frame as PNG"
				>
					<Camera className="h-4 w-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8"
					onClick={toggleFullscreen}
					aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
					aria-pressed={isFullscreen}
				>
					{isFullscreen ? (
						<Minimize className="h-4 w-4" aria-hidden="true" />
					) : (
						<Maximize className="h-4 w-4" aria-hidden="true" />
					)}
				</Button>
			</div>
		</div>
	)
}
