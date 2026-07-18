"use client"

import React, { useRef, useMemo, useCallback } from "react"
import { cn, formatVideoTime } from "@/lib/utils"
import { timeToPercent, timeFromPointer, assignLanes } from "@/lib/scrubber"

export interface ScrubberMarker {
	commentId: string
	t: number
	tEnd?: number | null
	label: string
	initial: string
	selected?: boolean
}

export interface ScrubberPeer {
	socketId: string
	name: string
	initial: string
	time: number
}

interface ScrubberProps {
	currentTime: number
	duration: number
	buffered?: { start: number; end: number }[]
	markers?: ScrubberMarker[]
	peers?: ScrubberPeer[]
	composingRange?: { start: number; end: number } | null
	frameStep?: number
	onSeek: (t: number) => void
	onSelectComment?: (commentId: string) => void
}

const MAX_LANES = 3
const LANE_HEIGHT = 18
const MIN_MARKER_SPAN_FRACTION = 0.03

export function Scrubber({
	currentTime,
	duration,
	buffered = [],
	markers = [],
	peers = [],
	composingRange = null,
	frameStep = 1 / 30,
	onSeek,
	onSelectComment,
}: ScrubberProps) {
	const trackRef = useRef<HTMLDivElement>(null)
	const draggingRef = useRef(false)

	const seekFromPointer = useCallback(
		(clientX: number) => {
			const rect = trackRef.current?.getBoundingClientRect()
			if (!rect || !duration) return
			onSeek(timeFromPointer(clientX, rect, duration))
		},
		[duration, onSeek]
	)

	const handlePointerDown = (e: React.PointerEvent) => {
		draggingRef.current = true
		e.currentTarget.setPointerCapture?.(e.pointerId)
		seekFromPointer(e.clientX)
	}

	const handlePointerMove = (e: React.PointerEvent) => {
		if (draggingRef.current) seekFromPointer(e.clientX)
	}

	const handlePointerUp = () => {
		draggingRef.current = false
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!duration) return
		let next: number | null = null
		switch (e.key) {
			case "ArrowLeft":
				next = currentTime - (e.shiftKey ? frameStep : 5)
				break
			case "ArrowRight":
				next = currentTime + (e.shiftKey ? frameStep : 5)
				break
			case "Home":
				next = 0
				break
			case "End":
				next = duration
				break
			default:
				return
		}
		e.preventDefault()
		e.stopPropagation()
		onSeek(Math.min(duration, Math.max(0, next)))
	}

	const laneLayout = useMemo(() => {
		if (!duration || markers.length === 0) {
			return { lanes: {} as Record<string, number>, overflow: [], count: 0 }
		}
		const minSpanSoOverlapsStackIntoLanes = duration * MIN_MARKER_SPAN_FRACTION
		const assignment = assignLanes(
			markers.map((m) => ({
				id: m.commentId,
				start: m.t,
				end: Math.max(m.tEnd ?? m.t, m.t) + minSpanSoOverlapsStackIntoLanes,
			})),
			MAX_LANES
		)
		const count = Math.min(
			MAX_LANES,
			Object.values(assignment.lanes).reduce((max, l) => Math.max(max, l + 1), 0)
		)
		return { ...assignment, count }
	}, [markers, duration])

	const overflowSet = useMemo(
		() => new Set(laneLayout.overflow),
		[laneLayout.overflow]
	)
	const firstOverflow = markers.find((m) => overflowSet.has(m.commentId))

	return (
		<div className="min-w-0 flex-1">
			{laneLayout.count > 0 && (
				<div
					className="relative"
					style={{ height: laneLayout.count * LANE_HEIGHT }}
				>
					{markers.map((marker) => {
						const lane = laneLayout.lanes[marker.commentId]
						if (lane === undefined) return null
						const isRange =
							typeof marker.tEnd === "number" && marker.tEnd > marker.t
						const left = timeToPercent(marker.t, duration)
						const width = isRange
							? Math.max(
									timeToPercent(marker.tEnd as number, duration) - left,
									1
							  )
							: 0
						const top = (laneLayout.count - 1 - lane) * LANE_HEIGHT
						const timeLabel = isRange
							? `${formatVideoTime(marker.t)} to ${formatVideoTime(
									marker.tEnd as number
							  )}`
							: formatVideoTime(marker.t)
						return (
							<button
								key={marker.commentId}
								type="button"
								onClick={() => onSelectComment?.(marker.commentId)}
								title={`${marker.label} · ${timeLabel}`}
								aria-label={`Comment by ${marker.label} at ${timeLabel}`}
								aria-pressed={marker.selected}
								className={cn(
									"absolute z-10 flex h-4 items-center rounded-full border text-[8px] font-semibold leading-none shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									marker.selected
										? "border-ring bg-primary text-primary-foreground ring-1 ring-ring"
										: "border-background bg-primary/80 text-primary-foreground"
								)}
								style={{
									top,
									left: `${left}%`,
									...(isRange
										? { width: `${width}%`, minWidth: 16 }
										: { width: 16, transform: "translateX(-50%)" }),
								}}
							>
								<span className="px-1">{marker.initial}</span>
							</button>
						)
					})}
					{firstOverflow && (
						<span
							className="absolute z-10 flex h-4 items-center rounded-full bg-muted px-1 text-[8px] font-semibold text-muted-foreground"
							style={{
								top: 0,
								left: `${timeToPercent(firstOverflow.t, duration)}%`,
							}}
							title={`${laneLayout.overflow.length} more comments`}
						>
							+{laneLayout.overflow.length}
						</span>
					)}
				</div>
			)}
			<div className="relative">
				<div
					ref={trackRef}
					role="slider"
					tabIndex={0}
					aria-label="Video scrubber"
					aria-valuemin={0}
					aria-valuemax={Math.round(duration)}
					aria-valuenow={Math.round(currentTime)}
					aria-valuetext={`${formatVideoTime(currentTime)} of ${formatVideoTime(
						duration
					)}`}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onKeyDown={handleKeyDown}
					className="group relative flex h-5 w-full cursor-pointer touch-none items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
						{buffered.map((range, i) => (
							<div
								key={i}
								className="absolute h-full bg-muted-foreground/25"
								style={{
									left: `${timeToPercent(range.start, duration)}%`,
									width: `${
										timeToPercent(range.end, duration) -
										timeToPercent(range.start, duration)
									}%`,
								}}
							/>
						))}
						<div
							className="absolute h-full bg-primary"
							style={{ width: `${timeToPercent(currentTime, duration)}%` }}
						/>
					</div>
					{composingRange && composingRange.end > composingRange.start && (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute h-2.5 rounded-full border border-primary bg-primary/25"
							style={{
								left: `${timeToPercent(composingRange.start, duration)}%`,
								width: `${
									timeToPercent(composingRange.end, duration) -
									timeToPercent(composingRange.start, duration)
								}%`,
							}}
						/>
					)}
					<div
						aria-hidden="true"
						className="pointer-events-none absolute z-10 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow"
						style={{ left: `${timeToPercent(currentTime, duration)}%` }}
					/>
				</div>
				{peers.map((peer) => (
					<button
						key={peer.socketId}
						type="button"
						onClick={() => onSeek(peer.time)}
						title={`${peer.name} is at ${formatVideoTime(peer.time)}`}
						aria-label={`${peer.name} is at ${formatVideoTime(
							peer.time
						)} — jump there`}
						className="absolute -top-1.5 z-20 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-background bg-foreground/80 text-[8px] font-semibold leading-none text-background shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						style={{ left: `${timeToPercent(peer.time, duration)}%` }}
					>
						{peer.initial}
					</button>
				))}
			</div>
		</div>
	)
}
