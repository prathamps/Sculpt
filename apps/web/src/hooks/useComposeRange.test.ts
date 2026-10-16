import { describe, expect, it } from "vitest"
import { markIn, markOut } from "./useComposeRange"

describe("timeline range marking", () => {
	it("starts a range at the playhead", () => {
		expect(markIn(null, 4)).toEqual({ start: 4, end: null })
	})

	it("keeps an existing out point that is still after the new in point", () => {
		expect(markIn({ start: 1, end: 9 }, 4)).toEqual({ start: 4, end: 9 })
	})

	it("drops an out point that the new in point has passed", () => {
		expect(markIn({ start: 1, end: 3 }, 4)).toEqual({ start: 4, end: null })
	})

	it("closes the range at the playhead", () => {
		expect(markOut({ start: 2, end: null }, 7)).toEqual({ start: 2, end: 7 })
	})

	it("swaps the ends when the out point lands before the in point", () => {
		expect(markOut({ start: 8, end: null }, 3)).toEqual({ start: 3, end: 8 })
	})
})
