import { describe, expect, it } from "vitest"
import {
	timeToPercent,
	timeFromPointer,
	clampRange,
	assignLanes,
} from "./scrubber"

describe("timeToPercent", () => {
	it("maps time linearly across the full track", () => {
		expect(timeToPercent(0, 100)).toBe(0)
		expect(timeToPercent(50, 100)).toBe(50)
		expect(timeToPercent(100, 100)).toBe(100)
	})

	it("clamps out-of-range values and handles a missing duration", () => {
		expect(timeToPercent(150, 100)).toBe(100)
		expect(timeToPercent(-5, 100)).toBe(0)
		expect(timeToPercent(10, 0)).toBe(0)
	})
})

describe("timeFromPointer", () => {
	it("converts a pointer position into a time on the track", () => {
		const rect = { left: 100, width: 200 }
		expect(timeFromPointer(100, rect, 60)).toBe(0)
		expect(timeFromPointer(200, rect, 60)).toBe(30)
		expect(timeFromPointer(300, rect, 60)).toBe(60)
	})

	it("clamps positions outside the track", () => {
		const rect = { left: 100, width: 200 }
		expect(timeFromPointer(0, rect, 60)).toBe(0)
		expect(timeFromPointer(500, rect, 60)).toBe(60)
	})
})

describe("clampRange", () => {
	it("keeps a valid range and orders end after start", () => {
		expect(clampRange(5, 10, 60)).toEqual({ start: 5, end: 10 })
		expect(clampRange(5, 3, 60)).toEqual({ start: 5, end: 5 })
	})

	it("clamps to the duration and floors at zero", () => {
		expect(clampRange(-2, 70, 60)).toEqual({ start: 0, end: 60 })
	})

	it("leaves values alone when duration is unknown", () => {
		expect(clampRange(5, 900, 0)).toEqual({ start: 5, end: 900 })
	})
})

describe("assignLanes", () => {
	it("packs non-overlapping intervals into one lane", () => {
		const { lanes, overflow } = assignLanes(
			[
				{ id: "a", start: 0, end: 5 },
				{ id: "b", start: 5, end: 10 },
				{ id: "c", start: 12, end: 15 },
			],
			3
		)
		expect(lanes).toEqual({ a: 0, b: 0, c: 0 })
		expect(overflow).toEqual([])
	})

	it("stacks overlapping intervals into separate lanes", () => {
		const { lanes } = assignLanes(
			[
				{ id: "a", start: 0, end: 10 },
				{ id: "b", start: 2, end: 8 },
				{ id: "c", start: 4, end: 6 },
			],
			3
		)
		expect(lanes.a).toBe(0)
		expect(lanes.b).toBe(1)
		expect(lanes.c).toBe(2)
	})

	it("collapses intervals beyond the lane cap into overflow", () => {
		const { lanes, overflow } = assignLanes(
			[
				{ id: "a", start: 0, end: 10 },
				{ id: "b", start: 1, end: 10 },
				{ id: "c", start: 2, end: 10 },
			],
			2
		)
		expect(Object.keys(lanes).sort()).toEqual(["a", "b"])
		expect(overflow).toEqual(["c"])
	})

	it("assigns lanes independently of input order", () => {
		const { lanes } = assignLanes(
			[
				{ id: "late", start: 20, end: 25 },
				{ id: "early", start: 0, end: 5 },
			],
			3
		)
		expect(lanes.early).toBe(0)
		expect(lanes.late).toBe(0)
	})
})
