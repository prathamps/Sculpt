// When a video annotation is drawn on screen. Pure so the appear/disappear
// rules can be unit-tested.

// How long an instant (non-range) annotation stays visible during playback.
export const DEFAULT_VISIBILITY_WINDOW = 2

// Playhead sampling tolerance so windows aren't missed at their exact edges.
export const WINDOW_EPSILON = 0.05

export interface TimedAnnotation {
	t?: number | null
	tEnd?: number | null
	isHighlighted?: boolean
}

// Visible when pinned via comment selection, untimed (drafts strip their
// window so they can't vanish while composing), or when the playhead is
// inside [t, tEnd] — instant annotations get a short default window.
export const isAnnotationVisibleAt = (
	annotation: TimedAnnotation,
	currentTime: number
): boolean => {
	if (annotation.isHighlighted) return true
	const start = annotation.t
	if (start === undefined || start === null) return true
	const end = annotation.tEnd ?? start + DEFAULT_VISIBILITY_WINDOW
	return (
		currentTime >= start - WINDOW_EPSILON &&
		currentTime <= end + WINDOW_EPSILON
	)
}
