import { describe, expect, it } from "vitest"
import {
	isAnnotationVisibleAt,
	DEFAULT_VISIBILITY_WINDOW,
	WINDOW_EPSILON,
} from "./annotation-visibility"

describe("isAnnotationVisibleAt", () => {
	it("shows an instant annotation for the default window after its time", () => {
		const a = { t: 10 }
		expect(isAnnotationVisibleAt(a, 9)).toBe(false)
		expect(isAnnotationVisibleAt(a, 10)).toBe(true)
		expect(isAnnotationVisibleAt(a, 10 + DEFAULT_VISIBILITY_WINDOW)).toBe(true)
		expect(
			isAnnotationVisibleAt(a, 10 + DEFAULT_VISIBILITY_WINDOW + 0.5)
		).toBe(false)
	})

	it("tolerates playhead sampling at the exact window edges", () => {
		const a = { t: 10 }
		expect(isAnnotationVisibleAt(a, 10 - WINDOW_EPSILON)).toBe(true)
		expect(
			isAnnotationVisibleAt(a, 10 + DEFAULT_VISIBILITY_WINDOW + WINDOW_EPSILON)
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

	it("is stable exactly at t for a paused playhead", () => {
		// Drawing pauses the video at t, so the freshly posted comment must be
		// visible at that exact position.
		expect(isAnnotationVisibleAt({ t: 7.32 }, 7.32)).toBe(true)
		expect(isAnnotationVisibleAt({ t: 7.32, tEnd: 9 }, 7.32)).toBe(true)
	})
})
