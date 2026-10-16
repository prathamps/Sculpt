"use client"

import { useCallback, useMemo, useState } from "react"
import type { ComposeRange } from "@/components/AnnotationFooter"

export const markIn = (
	previous: ComposeRange | null,
	time: number
): ComposeRange => ({
	start: time,
	end: previous?.end != null && previous.end >= time ? previous.end : null,
})

export const markOut = (
	previous: ComposeRange | null,
	time: number
): ComposeRange => {
	const start = previous?.start ?? time
	return start <= time ? { start, end: time } : { start: time, end: start }
}

export function useComposeRange(currentTime: number) {
	const [composeRange, setComposeRange] = useState<ComposeRange | null>(null)

	const handleMarkIn = useCallback(
		() => setComposeRange((previous) => markIn(previous, currentTime)),
		[currentTime]
	)

	const handleMarkOut = useCallback(
		() => setComposeRange((previous) => markOut(previous, currentTime)),
		[currentTime]
	)

	const clearRange = useCallback(() => setComposeRange(null), [])

	const composingRange = useMemo(
		() =>
			composeRange?.start != null && composeRange?.end != null
				? { start: composeRange.start, end: composeRange.end }
				: null,
		[composeRange]
	)

	return {
		composeRange,
		composingRange,
		handleMarkIn,
		handleMarkOut,
		clearRange,
	}
}
