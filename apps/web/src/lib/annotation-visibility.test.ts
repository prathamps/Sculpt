import { describe, expect, it } from "vitest"
import {
	annotationTimeWindow,
	isAnnotationVisibleAt,
	timeWindowsOverlap,
	INSTANT_ANNOTATION_VISIBILITY_SECONDS,
	PLAYHEAD_SAMPLING_EPSILON_SECONDS,
} from "./annotation-visibility"

describe("isAnnotationVisibleAt", () => {
	it("shows an instant annotation for the default window after its time", () => {
		const a = { t: 10 }
		expect(isAnnotationVisibleAt(a, 9)).toBe(false)
		expect(isAnnotationVisibleAt(a, 10)).toBe(true)
		expect(
			isAnnotationVisibleAt(a, 10 + INSTANT_ANNOTATION_VISIBILITY_SECONDS)
		).toBe(true)
		expect(
			isAnnotationVisibleAt(a, 10 + INSTANT_ANNOTATION_VISIBILITY_SECONDS + 0.5)
		).toBe(false)
	})

	it("tolerates playhead sampling at the exact window edges", () => {
		const a = { t: 10 }
		expect(
			isAnnotationVisibleAt(a, 10 - PLAYHEAD_SAMPLING_EPSILON_SECONDS)
		).toBe(true)
		expect(
			isAnnotationVisibleAt(
				a,
				10 +
					INSTANT_ANNOTATION_VISIBILITY_SECONDS +
					PLAYHEAD_SAMPLING_EPSILON_SECONDS
			)
		).toBe(true)
	})

	it("shows a range annotation for its whole range and not outside it", () => {
		const a = { t: 5, tEnd: 20 }
		expect(isAnnotationVisibleAt(a, 4)).toBe(false)
		expect(isAnnotationVisibleAt(a, 5)).toBe(true)
		expect(isAnnotationVisibleAt(a, 12)).toBe(true)
		expect(isAnnotationVisibleAt(a, 20)).toBe(true)
		expect(isAnnotationVisibleAt(a, 21)).toBe(false)
	})

	it("does not extend a range by the default window", () => {
		const a = { t: 5, tEnd: 6 }
		expect(isAnnotationVisibleAt(a, 6.5)).toBe(false)
	})

	it("always shows a highlighted annotation, even outside its window", () => {
		expect(isAnnotationVisibleAt({ t: 10, isHighlighted: true }, 55)).toBe(
			true
		)
		expect(
			isAnnotationVisibleAt({ t: 10, tEnd: 12, isHighlighted: true }, 0)
		).toBe(true)
	})

	it("always shows untimed annotations (unsent drafts)", () => {
		expect(isAnnotationVisibleAt({}, 42)).toBe(true)
		expect(isAnnotationVisibleAt({ t: null }, 42)).toBe(true)
	})

	it("keeps a freshly posted comment visible when drawing paused the video exactly at t", () => {
		expect(isAnnotationVisibleAt({ t: 7.32 }, 7.32)).toBe(true)
		expect(isAnnotationVisibleAt({ t: 7.32, tEnd: 9 }, 7.32)).toBe(true)
	})

	it("keeps a pinned annotation on screen wherever the playhead is", () => {
		expect(isAnnotationVisibleAt({ t: 10, pinned: true }, 90)).toBe(true)
		expect(isAnnotationVisibleAt({ t: 10, tEnd: 12, pinned: true }, 0)).toBe(
			true
		)
	})
})

describe("annotationTimeWindow", () => {
	it("pads an instant mark by the default visibility window", () => {
		expect(annotationTimeWindow({ t: 10 })).toEqual({
			start: 10,
			end: 10 + INSTANT_ANNOTATION_VISIBILITY_SECONDS,
		})
	})

	it("uses an explicit range as-is", () => {
		expect(annotationTimeWindow({ t: 5, tEnd: 20 })).toEqual({
			start: 5,
			end: 20,
		})
	})

	it("has no window for an untimed annotation", () => {
		expect(annotationTimeWindow({})).toBeNull()
		expect(annotationTimeWindow({ t: null })).toBeNull()
	})
})

describe("timeWindowsOverlap", () => {
	it("detects overlapping ranges in either order", () => {
		expect(timeWindowsOverlap({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(
			true
		)
		expect(timeWindowsOverlap({ start: 5, end: 15 }, { start: 0, end: 10 })).toBe(
			true
		)
	})

	it("counts a shared edge as overlapping", () => {
		expect(timeWindowsOverlap({ start: 0, end: 5 }, { start: 5, end: 9 })).toBe(
			true
		)
	})

	it("rejects ranges that do not touch", () => {
		expect(timeWindowsOverlap({ start: 0, end: 4 }, { start: 5, end: 9 })).toBe(
			false
		)
	})

	it("treats a window-less annotation as always overlapping", () => {
		expect(timeWindowsOverlap(null, { start: 5, end: 9 })).toBe(true)
		expect(timeWindowsOverlap({ start: 5, end: 9 }, null)).toBe(true)
	})

	it("counts two instant marks a second apart as overlapping, since each lasts two seconds", () => {
		const first = annotationTimeWindow({ t: 10 })
		const second = annotationTimeWindow({ t: 11 })
		expect(timeWindowsOverlap(first, second)).toBe(true)
	})

	it("keeps instant marks far apart separate", () => {
		const first = annotationTimeWindow({ t: 10 })
		const second = annotationTimeWindow({ t: 30 })
		expect(timeWindowsOverlap(first, second)).toBe(false)
	})
})
