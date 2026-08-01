export const INSTANT_ANNOTATION_VISIBILITY_SECONDS = 2

export const PLAYHEAD_SAMPLING_EPSILON_SECONDS = 0.05

export interface TimedAnnotation {
	t?: number | null
	tEnd?: number | null
	isHighlighted?: boolean
	pinned?: boolean
}

export interface TimeWindow {
	start: number
	end: number
}

export const annotationTimeWindow = (
	annotation: TimedAnnotation
): TimeWindow | null => {
	const start = annotation.t
	if (start === undefined || start === null) return null
	return {
		start,
		end: annotation.tEnd ?? start + INSTANT_ANNOTATION_VISIBILITY_SECONDS,
	}
}

export const isAnnotationVisibleAt = (
	annotation: TimedAnnotation,
	currentTime: number
): boolean => {
	if (annotation.pinned || annotation.isHighlighted) return true
	const window = annotationTimeWindow(annotation)
	if (!window) return true
	return (
		currentTime >= window.start - PLAYHEAD_SAMPLING_EPSILON_SECONDS &&
		currentTime <= window.end + PLAYHEAD_SAMPLING_EPSILON_SECONDS
	)
}
