"use client"

import { ReactNode, createContext, useCallback, useContext } from "react"
import { useViewerPreference } from "@/hooks/useViewerPreference"
import { formatVideoTime } from "@/lib/utils"
import {
	TIME_DISPLAY_MODES,
	TimeDisplayMode,
	VideoTiming,
	formatPlayhead,
	nextTimeDisplayMode,
} from "@/lib/timecode"

const TIME_DISPLAY_KEY = "sculpt:time-display"

const VideoTimingContext = createContext<VideoTiming | null>(null)

export function VideoTimingProvider({
	timing,
	children,
}: {
	timing: VideoTiming | null
	children: ReactNode
}) {
	return (
		<VideoTimingContext.Provider value={timing}>{children}</VideoTimingContext.Provider>
	)
}

export const defaultTimeDisplayFor = (timing: VideoTiming | null): TimeDisplayMode =>
	timing?.startTimecode ? "timecode" : "seconds"

export function useTimeDisplayMode(timing: VideoTiming | null) {
	const [mode, setMode] = useViewerPreference<TimeDisplayMode>(
		TIME_DISPLAY_KEY,
		TIME_DISPLAY_MODES,
		defaultTimeDisplayFor(timing)
	)
	const cycleMode = useCallback(() => setMode(nextTimeDisplayMode(mode)), [mode, setMode])
	return { mode, setMode, cycleMode }
}

export function useVideoTimeFormatter(): (seconds: number, precise?: boolean) => string {
	const timing = useContext(VideoTimingContext)
	const { mode } = useTimeDisplayMode(timing)
	return useCallback(
		(seconds: number, precise = false) =>
			timing ? formatPlayhead(seconds, mode, timing, precise) : formatVideoTime(seconds, precise),
		[mode, timing]
	)
}
