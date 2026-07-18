// Pure math for the custom video scrubber. Everything maps through the same
// track box, so the playhead, comment markers and presence avatars can't
// drift apart the way they did over a native <input type="range">.

export const timeToPercent = (t: number, duration: number): number => {
	if (!duration || !isFinite(duration)) return 0
	return Math.min(100, Math.max(0, (t / duration) * 100))
}

export const timeFromPointer = (
	clientX: number,
	rect: { left: number; width: number },
	duration: number
): number => {
	if (!rect.width || !duration) return 0
	const fraction = (clientX - rect.left) / rect.width
	return Math.min(duration, Math.max(0, fraction * duration))
}

export const clampRange = (
	start: number,
	end: number,
	duration: number
): { start: number; end: number } => {
	const max = duration > 0 ? duration : Infinity
	const clampedStart = Math.min(Math.max(0, start), max)
	const clampedEnd = Math.min(Math.max(clampedStart, end), max)
	return { start: clampedStart, end: clampedEnd }
}

export interface LaneInterval {
	id: string
	start: number
	end: number
}

export interface LaneAssignment {
	lanes: Record<string, number>
	overflow: string[]
}

// Greedy interval packing: each marker takes the lowest lane that is free at
// its start. Markers that would need more than maxLanes collapse into an
// overflow group ("+N").
export const assignLanes = (
	intervals: LaneInterval[],
	maxLanes: number
): LaneAssignment => {
	const sorted = [...intervals].sort(
		(a, b) => a.start - b.start || a.end - b.end
	)
	const laneEnds: number[] = []
	const lanes: Record<string, number> = {}
	const overflow: string[] = []

	for (const interval of sorted) {
		let lane = laneEnds.findIndex((end) => end <= interval.start)
		if (lane === -1) {
			if (laneEnds.length < maxLanes) {
				lane = laneEnds.length
				laneEnds.push(interval.end)
			} else {
				overflow.push(interval.id)
				continue
			}
		} else {
			laneEnds[lane] = interval.end
		}
		lanes[interval.id] = lane
	}

	return { lanes, overflow }
}
