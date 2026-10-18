"use client"

import React, {
	useRef,
	useEffect,
	useLayoutEffect,
	useState,
	useCallback,
	useId,
	useMemo,
} from "react"
import { AnnotationTool } from "@/types"
import { cn, isEditableTarget } from "@/lib/utils"
import { drawAnnotations } from "@/lib/annotation-drawing"
import { useDrawingSurface } from "@/hooks/useDrawingSurface"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useViewerPreference } from "@/hooks/useViewerPreference"
import { useTimeDisplayMode } from "@/context/VideoTimingContext"
import {
	devicePixelRatio,
	observeElementSize,
	scaleContextToPixelRatio,
	cssCanvasSize,
} from "@/lib/canvas"
import {
	TIME_DISPLAY_LABELS,
	formatPlayhead,
	frameAt,
	frameMidpoint,
	lastFrameOf,
	nextTimeDisplayMode,
	videoTimingFor,
} from "@/lib/timecode"
import {
	VIDEO_QUALITIES,
	VIDEO_QUALITY_BADGES,
	VIDEO_QUALITY_LABELS,
	VideoQuality,
	chooseVideoSource,
	currentPlaybackConditions,
	prefersLightRendition,
} from "@/lib/video-quality"

import { isAnnotationVisibleAt } from "@/lib/annotation-visibility"
import type { PlaybackEvent, PlaybackLink } from "@/lib/camera-link"
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
	MoreHorizontal,
	Pencil,
	Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortalContainer,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const VIDEO_QUALITY_KEY = "sculpt:video-quality"
const SEEK_STEP_SECONDS = 5
const SYNC_TOLERANCE_SECONDS = 0.05

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
	lowVideoUrl?: string | null
	tool: AnnotationTool
	color: string
	annotations: VideoAnnotation[]
	onAddAnnotation: (
		annotation: Omit<VideoAnnotation, "id" | "points"> & { points: Point[] }
	) => void
	onTimeChange?: (time: number, duration: number) => void
	onPlayStateChange?: (isPlaying: boolean) => void
	seekRequest?: SeekRequest | null
	frameRate?: number | null
	startTimecode?: string | null
	markers?: ScrubberMarker[]
	peers?: ScrubberPeer[]
	composingRange?: { start: number; end: number } | null
	onSelectComment?: (commentId: string) => void
	initialDuration?: number | null
	canDraw?: boolean
	enableShortcuts?: boolean
	canExportFrames?: boolean
	playbackLink?: PlaybackLink | null
}

const PLAYHEAD_PUBLISH_INTERVAL_SECONDS = 0.1

interface ScreenOrientationLock {
	lock?: (orientation: string) => Promise<void>
	unlock?: () => void
}

const orientationOf = (): ScreenOrientationLock | undefined =>
	typeof screen === "undefined"
		? undefined
		: (screen.orientation as ScreenOrientation & ScreenOrientationLock | undefined)

const canUseNativeFullscreen = (element: HTMLElement | null): boolean =>
	!!element &&
	typeof document !== "undefined" &&
	document.fullscreenEnabled === true &&
	typeof element.requestFullscreen === "function"

const controlButton = "h-8 w-8 shrink-0 pointer-coarse:h-10 pointer-coarse:w-10"

export function VideoAnnotationCanvas({
	videoUrl,
	lowVideoUrl = null,
	tool,
	color,
	annotations,
	onAddAnnotation,
	onTimeChange,
	onPlayStateChange,
	seekRequest,
	frameRate = null,
	startTimecode = null,
	markers = [],
	peers = [],
	composingRange = null,
	onSelectComment,
	initialDuration = null,
	canDraw = true,
	enableShortcuts = true,
	canExportFrames = false,
	playbackLink = null,
}: VideoAnnotationCanvasProps) {
	const syncId = useId()
	const applyingRemoteRef = useRef(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
	const previewCanvasRef = useRef<HTMLCanvasElement>(null)
	const rootRef = useRef<HTMLDivElement | null>(null)
	const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null)
	const attachRoot = useCallback((element: HTMLDivElement | null) => {
		rootRef.current = element
		setRootElement(element)
	}, [])

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
	const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
	const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false)
	const [isDrawMode, setIsDrawMode] = useState(false)

	const isCoarsePointer = useMediaQuery("(pointer: coarse)")
	const [quality, setQuality] = useViewerPreference<VideoQuality>(
		VIDEO_QUALITY_KEY,
		VIDEO_QUALITIES,
		"auto"
	)
	const autoPrefersLight = useMemo(
		() => (videoUrl ? prefersLightRendition(currentPlaybackConditions()) : false),
		[videoUrl]
	)
	const activeUrl = chooseVideoSource(
		quality,
		{ full: videoUrl, low: lowVideoUrl },
		autoPrefersLight
	)

	const timing = useMemo(
		() => videoTimingFor(frameRate, startTimecode),
		[frameRate, startTimecode]
	)
	const { mode: timeMode, setMode: setTimeMode } = useTimeDisplayMode(timing)

	const isFullscreen = isNativeFullscreen || isPseudoFullscreen
	const isDrawingArmed = canDraw && (!isCoarsePointer || isDrawMode)

	const playheadRef = useRef(0)
	const resumeRef = useRef<{ time: number; playing: boolean } | null>(null)
	const isPlayingRef = useRef(false)
	const shownSourceRef = useRef({ videoUrl, activeUrl })

	useLayoutEffect(() => {
		const shown = shownSourceRef.current
		if (shown.videoUrl === videoUrl && shown.activeUrl !== activeUrl) {
			resumeRef.current = { time: playheadRef.current, playing: isPlayingRef.current }
		}
		shownSourceRef.current = { videoUrl, activeUrl }
	}, [videoUrl, activeUrl])

	const setPlaying = useCallback(
		(playing: boolean) => {
			isPlayingRef.current = playing
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
		const fill = isFullscreen ? 1 : 0.95

		let width: number
		let height: number
		if (videoAspect > containerAspect) {
			width = containerWidth * fill
			height = width / videoAspect
		} else {
			height = containerHeight * fill
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
	}, [drawAll, isFullscreen])

	useEffect(() => {
		resumeRef.current = null
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

	const playVideo = useCallback(() => {
		const video = videoRef.current
		if (!video) return
		void video.play().catch(() => setPlaying(false))
	}, [setPlaying])

	const handleLoadedMetadata = () => {
		const video = videoRef.current
		if (!video) return
		setDuration(video.duration || 0)
		setIsLoading(false)
		const resume = resumeRef.current
		resumeRef.current = null
		if (resume) {
			video.currentTime = resume.time
			playheadRef.current = resume.time
			if (resume.playing) playVideo()
		}
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

	const broadcast = useCallback(
		(event: PlaybackEvent) => {
			if (!applyingRemoteRef.current) playbackLink?.publish(syncId, event)
		},
		[playbackLink, syncId]
	)

	const togglePlay = useCallback(() => {
		const video = videoRef.current
		if (!video) return
		if (video.paused) {
			setIsDrawMode(false)
			playVideo()
			setPlaying(true)
			broadcast({ kind: "play", time: video.currentTime })
		} else {
			video.pause()
			setPlaying(false)
			broadcast({ kind: "pause", time: video.currentTime })
		}
	}, [broadcast, playVideo, setPlaying])

	const seekTo = useCallback(
		(t: number) => {
			const video = videoRef.current
			if (!video) return
			video.currentTime = Math.max(0, Math.min(t, video.duration || t))
			playheadRef.current = video.currentTime
			setCurrentTime(video.currentTime)
			onTimeChange?.(video.currentTime, video.duration || 0)
			drawAll()
			broadcast({ kind: "seek", time: video.currentTime })
		},
		[broadcast, onTimeChange, drawAll]
	)

	const changePlaybackRate = useCallback(
		(rate: number) => {
			setPlaybackRate(rate)
			broadcast({ kind: "rate", rate })
		},
		[broadcast]
	)

	useEffect(() => {
		if (!playbackLink) return
		return playbackLink.subscribe(syncId, (event) => {
			const video = videoRef.current
			if (!video) return
			applyingRemoteRef.current = true
			try {
				if (event.kind === "rate") {
					setPlaybackRate(event.rate)
					return
				}
				if (event.kind === "seek" || Math.abs(video.currentTime - event.time) > SYNC_TOLERANCE_SECONDS) {
					seekTo(event.time)
				}
				if (event.kind === "play") {
					playVideo()
					setPlaying(true)
				}
				if (event.kind === "pause") {
					video.pause()
					setPlaying(false)
				}
			} finally {
				applyingRemoteRef.current = false
			}
		})
	}, [playbackLink, playVideo, seekTo, setPlaying, syncId])

	const stepFrame = useCallback(
		(dir: 1 | -1) => {
			const video = videoRef.current
			if (!video) return
			video.pause()
			setPlaying(false)
			broadcast({ kind: "pause", time: video.currentTime })
			const lastFrame = lastFrameOf(video.duration || duration, timing.base)
			const target = Math.min(
				lastFrame,
				Math.max(0, frameAt(video.currentTime, timing.base) + dir)
			)
			seekTo(frameMidpoint(target, timing.base))
		},
		[broadcast, duration, seekTo, setPlaying, timing.base]
	)

	const changeQuality = (next: VideoQuality) => setQuality(next)

	useEffect(() => {
		const video = videoRef.current
		if (!video) return
		video.playbackRate = playbackRate
		video.loop = isLooping
		video.muted = isMuted
		video.volume = volume
	}, [playbackRate, isLooping, isMuted, volume, activeUrl])

	const toggleFullscreen = useCallback(() => {
		const root = rootRef.current
		if (!root) return
		if (document.fullscreenElement) {
			void document.exitFullscreen()
			return
		}
		if (isPseudoFullscreen) {
			setIsPseudoFullscreen(false)
			return
		}
		if (canUseNativeFullscreen(root)) {
			root
				.requestFullscreen()
				.then(() => {
					const video = videoRef.current
					if (isCoarsePointer && video && video.videoWidth > video.videoHeight) {
						void orientationOf()?.lock?.("landscape").catch(() => undefined)
					}
				})
				.catch(() => setIsPseudoFullscreen(true))
			return
		}
		setIsPseudoFullscreen(true)
	}, [isCoarsePointer, isPseudoFullscreen])

	useEffect(() => {
		const onFullscreenChange = () => {
			const active = document.fullscreenElement === rootRef.current
			setIsNativeFullscreen(active)
			if (!active) orientationOf()?.unlock?.()
		}
		document.addEventListener("fullscreenchange", onFullscreenChange)
		return () =>
			document.removeEventListener("fullscreenchange", onFullscreenChange)
	}, [])

	useEffect(() => {
		if (!isPseudoFullscreen) return
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = "hidden"
		return () => {
			document.body.style.overflow = previousOverflow
		}
	}, [isPseudoFullscreen])

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
					else seekTo(video.currentTime - SEEK_STEP_SECONDS)
					break
				case "ArrowRight":
					e.preventDefault()
					if (e.shiftKey) stepFrame(1)
					else seekTo(video.currentTime + SEEK_STEP_SECONDS)
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
				case "Escape":
					setIsPseudoFullscreen(false)
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
				a.download = `frame-${frameAt(video.currentTime, timing.base)}.png`
				a.click()
				URL.revokeObjectURL(url)
			})
		} catch (err) {
			console.error("Failed to export frame:", err)
		}
	}

	const formatTime = useCallback(
		(seconds: number, precise = false) =>
			formatPlayhead(seconds, timeMode, timing, precise),
		[timeMode, timing]
	)
	const playheadLabel = formatTime(currentTime, true)
	const durationLabel = formatTime(duration)
	const nextMode = nextTimeDisplayMode(timeMode)

	const toggleDrawMode = () => {
		const next = !isDrawMode
		if (next) {
			videoRef.current?.pause()
			setPlaying(false)
		} else {
			cancelStroke()
		}
		setIsDrawMode(next)
	}

	const handleSurfaceKeyDown = (event: React.KeyboardEvent) => {
		if (event.key !== "Enter" && event.key !== " ") return
		event.preventDefault()
		event.stopPropagation()
		togglePlay()
	}

	const qualityItems = lowVideoUrl
		? VIDEO_QUALITIES.map((option) => (
				<DropdownMenuItem
					key={option}
					className="gap-2 text-xs"
					onClick={() => changeQuality(option)}
					aria-checked={option === quality}
					role="menuitemradio"
				>
					<Check
						className={cn("h-3.5 w-3.5", option !== quality && "invisible")}
						aria-hidden="true"
					/>
					{VIDEO_QUALITY_LABELS[option]}
				</DropdownMenuItem>
			))
		: null

	return (
		<DropdownMenuPortalContainer value={rootElement}>
			<div
				ref={attachRoot}
				className={cn(
					"flex h-full w-full flex-col bg-background",
					isPseudoFullscreen && "fixed inset-0 z-[60] h-dvh w-screen bg-black"
				)}
			>
				<div
					ref={containerRef}
					className={cn(
						"relative flex min-h-0 flex-1 items-center justify-center overflow-hidden",
						isFullscreen ? "bg-black" : "bg-black/40"
					)}
				>
					{isLoading && (
						<div className="absolute inset-0 z-10 flex items-center justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
						</div>
					)}
					{error ? (
						<div className="text-center text-muted-foreground">
							<p className="text-sm">{error}</p>
						</div>
					) : (
						<div
							className="relative"
							role={isDrawingArmed ? undefined : "button"}
							tabIndex={isDrawingArmed ? undefined : 0}
							aria-label={isDrawingArmed ? undefined : isPlaying ? "Pause video" : "Play video"}
							onClick={isDrawingArmed ? undefined : togglePlay}
							onKeyDown={isDrawingArmed ? undefined : handleSurfaceKeyDown}
						>
							<video
								ref={videoRef}
								src={activeUrl}
								crossOrigin="anonymous"
								playsInline
								preload="metadata"
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
								className={cn("block shadow-md", !isFullscreen && "rounded-md")}
							/>
							<canvas
								ref={drawingCanvasRef}
								className="pointer-events-none absolute left-0 top-0"
							/>
							<canvas
								ref={previewCanvasRef}
								onMouseDown={isDrawingArmed ? handlers.onMouseDown : undefined}
								onMouseMove={isDrawingArmed ? handlers.onMouseMove : undefined}
								onMouseUp={isDrawingArmed ? handlers.onMouseUp : undefined}
								onMouseLeave={isDrawingArmed ? handlers.onMouseLeave : undefined}
								onTouchStart={isDrawingArmed ? handlers.onTouchStart : undefined}
								onTouchMove={isDrawingArmed ? handlers.onTouchMove : undefined}
								onTouchEnd={isDrawingArmed ? handlers.onTouchEnd : undefined}
								onTouchCancel={isDrawingArmed ? handlers.onTouchCancel : undefined}
								className={
									isDrawingArmed
										? "absolute left-0 top-0 cursor-crosshair touch-none"
										: "pointer-events-none absolute left-0 top-0"
								}
							/>
						</div>
					)}
					{isDrawMode && isCoarsePointer && (
						<p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs text-foreground shadow-sm">
							Drawing — tap the pencil again to scrub
						</p>
					)}
				</div>

				<div className="@container border-t border-border/40 bg-card px-2 py-1.5 @2xl:px-3 @2xl:py-2">
					<div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 @2xl:flex-nowrap @2xl:items-end @2xl:gap-2">
						<Button
							size="icon"
							variant="ghost"
							className={controlButton}
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
							className={controlButton}
							onClick={() => stepFrame(-1)}
							aria-label="Previous frame"
						>
							<ChevronLeft className="h-4 w-4" aria-hidden="true" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							className={controlButton}
							onClick={() => stepFrame(1)}
							aria-label="Next frame"
						>
							<ChevronRight className="h-4 w-4" aria-hidden="true" />
						</Button>
						<button
							type="button"
							onClick={() => setTimeMode(nextMode)}
							className="shrink-0 rounded px-1.5 py-1 text-left font-mono text-xs tabular-nums text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @2xl:pb-1"
							aria-label={`Current time ${playheadLabel}. Showing ${TIME_DISPLAY_LABELS[timeMode]}; switch to ${TIME_DISPLAY_LABELS[nextMode]}`}
							title={`Showing ${TIME_DISPLAY_LABELS[timeMode]} — click for ${TIME_DISPLAY_LABELS[nextMode]}`}
						>
							{playheadLabel}
							<span className="text-muted-foreground/60 @2xl:hidden"> / {durationLabel}</span>
						</button>

						<div className="order-first flex w-full min-w-0 items-end gap-2 @2xl:order-none @2xl:w-auto @2xl:flex-1">
							<Scrubber
								currentTime={currentTime}
								duration={duration}
								buffered={buffered}
								markers={markers}
								peers={peers}
								composingRange={composingRange}
								onStepFrame={stepFrame}
								formatTime={formatTime}
								onSeek={seekTo}
								onSelectComment={onSelectComment}
							/>
							<span className="hidden pb-1 font-mono text-xs tabular-nums text-muted-foreground @2xl:inline">
								{durationLabel}
							</span>
						</div>

						<div className="ml-auto flex items-center gap-0.5 @2xl:ml-0 @2xl:gap-1">
							{canDraw && isCoarsePointer && (
								<Button
									size="icon"
									variant={isDrawMode ? "default" : "ghost"}
									className={controlButton}
									onClick={toggleDrawMode}
									aria-label={isDrawMode ? "Stop drawing" : "Draw on this frame"}
									aria-pressed={isDrawMode}
								>
									<Pencil className="h-4 w-4" aria-hidden="true" />
								</Button>
							)}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										size="sm"
										variant="ghost"
										className="h-8 shrink-0 px-1.5 font-mono text-xs tabular-nums pointer-coarse:h-10"
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
											onClick={() => changePlaybackRate(rate)}
										>
											{rate}×
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
							{qualityItems && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											size="sm"
											variant="ghost"
											className="hidden h-8 shrink-0 px-1.5 text-xs @2xl:inline-flex"
											aria-label={`Playback quality: ${VIDEO_QUALITY_LABELS[quality]}`}
										>
											{VIDEO_QUALITY_BADGES[quality]}
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48">
										<DropdownMenuLabel className="text-xs">Quality</DropdownMenuLabel>
										{qualityItems}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							<Button
								size="icon"
								variant="ghost"
								className={cn(controlButton, "hidden @2xl:inline-flex", isLooping && "text-primary")}
								onClick={() => setIsLooping((looping) => !looping)}
								aria-label="Loop playback"
								aria-pressed={isLooping}
							>
								<Repeat className="h-4 w-4" aria-hidden="true" />
							</Button>
							<Button
								size="icon"
								variant="ghost"
								className={cn(controlButton, "hidden @2xl:inline-flex")}
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
								className="hidden w-16 accent-primary pointer-coarse:hidden @3xl:block"
							/>
							{canExportFrames && (
								<Button
									size="icon"
									variant="ghost"
									className={cn(controlButton, "hidden @2xl:inline-flex")}
									onClick={downloadFrame}
									aria-label="Download annotated frame as PNG"
								>
									<Camera className="h-4 w-4" aria-hidden="true" />
								</Button>
							)}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										className={cn(controlButton, "@2xl:hidden")}
										aria-label="More playback options"
									>
										<MoreHorizontal className="h-4 w-4" aria-hidden="true" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-52">
									<DropdownMenuItem
										className="gap-2 text-xs"
										onClick={() => setIsLooping((looping) => !looping)}
										role="menuitemcheckbox"
										aria-checked={isLooping}
									>
										<Repeat className="h-3.5 w-3.5" aria-hidden="true" />
										{isLooping ? "Stop looping" : "Loop playback"}
									</DropdownMenuItem>
									<DropdownMenuItem
										className="gap-2 text-xs"
										onClick={() => setIsMuted((muted) => !muted)}
										role="menuitemcheckbox"
										aria-checked={isMuted}
									>
										{isMuted ? (
											<VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
										) : (
											<Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
										)}
										{isMuted ? "Unmute" : "Mute"}
									</DropdownMenuItem>
									{canExportFrames && (
										<DropdownMenuItem className="gap-2 text-xs" onClick={downloadFrame}>
											<Camera className="h-3.5 w-3.5" aria-hidden="true" />
											Save this frame (PNG)
										</DropdownMenuItem>
									)}
									{qualityItems && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuLabel className="text-xs">Quality</DropdownMenuLabel>
											{qualityItems}
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
							<Button
								size="icon"
								variant="ghost"
								className={controlButton}
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
				</div>
			</div>
		</DropdownMenuPortalContainer>
	)
}
