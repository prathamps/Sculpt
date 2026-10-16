import { describe, expect, it } from "vitest"
import { forEachConcurrently } from "./concurrency"

describe("forEachConcurrently", () => {
	it("visits every item while never running more than the limit at once", async () => {
		let running = 0
		let peak = 0
		const seen: number[] = []

		await forEachConcurrently([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
			running++
			peak = Math.max(peak, running)
			await new Promise((resolve) => setTimeout(resolve, 1))
			seen.push(item)
			running--
		})

		expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
		expect(peak).toBe(3)
	})

	it("completes immediately for an empty list", async () => {
		await expect(forEachConcurrently([], 4, async () => {})).resolves.toBeUndefined()
	})
})
