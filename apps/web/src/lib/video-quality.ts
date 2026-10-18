export type VideoQuality = "auto" | "high" | "low"

export const VIDEO_QUALITIES: VideoQuality[] = ["auto", "high", "low"]

export const VIDEO_QUALITY_LABELS: Record<VideoQuality, string> = {
	auto: "Auto",
	high: "High (up to 1080p)",
	low: "Data saver (540p)",
}

export const VIDEO_QUALITY_BADGES: Record<VideoQuality, string> = {
	auto: "Auto",
	high: "HD",
	low: "SD",
}

const SLOW_CONNECTIONS = new Set(["slow-2g", "2g", "3g"])

export interface PlaybackConditions {
	narrowScreen: boolean
	saveData: boolean
	effectiveType: string | null
}

export const prefersLightRendition = ({
	narrowScreen,
	saveData,
	effectiveType,
}: PlaybackConditions): boolean =>
	narrowScreen || saveData || (effectiveType !== null && SLOW_CONNECTIONS.has(effectiveType))

export const chooseVideoSource = (
	quality: VideoQuality,
	sources: { full: string; low: string | null },
	prefersLight: boolean
): string => {
	if (!sources.low || quality === "high") return sources.full
	if (quality === "low") return sources.low
	return prefersLight ? sources.low : sources.full
}

const NARROW_SCREEN_QUERY = "(max-width: 768px)"

export const currentPlaybackConditions = (): PlaybackConditions => ({
	narrowScreen:
		typeof window !== "undefined" && window.matchMedia(NARROW_SCREEN_QUERY).matches,
	...currentNetwork(),
})

interface NetworkInformationLike {
	saveData?: boolean
	effectiveType?: string
}

export const currentNetwork = (): Pick<PlaybackConditions, "saveData" | "effectiveType"> => {
	const connection =
		typeof navigator === "undefined"
			? undefined
			: (navigator as Navigator & { connection?: NetworkInformationLike }).connection
	return {
		saveData: connection?.saveData === true,
		effectiveType: connection?.effectiveType ?? null,
	}
}
