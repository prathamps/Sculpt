export const INSTANT_ANNOTATION_VISIBILITY_SECONDS = 2

export const PLAYHEAD_SAMPLING_EPSILON_SECONDS = 0.05

export interface TimedAnnotation {
	t?: number | null
	tEnd?: number | null
	isHighlighted?: boolean
}

export const isAnnotationVisibleAt = (
	annotation: TimedAnnotation,
	currentTime: number
): boolean => {
	if (annotation.isHighlighted) return true
	const start = annotation.t
	if (start === undefined || start === null) return true
	const end = annotation.tEnd ?? start + INSTANT_ANNOTATION_VISIBILITY_SECONDS
	return (
		currentTime >= start - PLAYHEAD_SAMPLING_EPSILON_SECONDS &&
		currentTime <= end + PLAYHEAD_SAMPLING_EPSILON_SECONDS
	)
}
