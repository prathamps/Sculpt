import { describe, expect, it, vi, afterEach } from "vitest"
import { cutoffForRetention, retentionDaysFromEnv, runPeriodically } from "./schedule"

afterEach(() => {
	vi.useRealTimers()
	delete process.env.TEST_RETENTION_DAYS
})

describe("runPeriodically", () => {
	it("never starts a run while the previous one is still going", async () => {
		vi.useFakeTimers()
		let release: () => void = () => {}
		const task = vi.fn(
			() => new Promise<void>((resolve) => (release = resolve))
		)

		const timer = runPeriodically("test", 1000, task)
		await vi.advanceTimersByTimeAsync(3000)
		expect(task).toHaveBeenCalledTimes(1)

		release()
		await vi.advanceTimersByTimeAsync(1000)
		expect(task).toHaveBeenCalledTimes(2)
		clearInterval(timer)
	})
})

describe("retentionDaysFromEnv", () => {
	it("uses the fallback when unset or invalid", () => {
		expect(retentionDaysFromEnv("TEST_RETENTION_DAYS", 90)).toBe(90)
		process.env.TEST_RETENTION_DAYS = "forever"
		expect(retentionDaysFromEnv("TEST_RETENTION_DAYS", null)).toBeNull()
	})

	it("honours a positive number of days", () => {
		process.env.TEST_RETENTION_DAYS = "30"
		expect(retentionDaysFromEnv("TEST_RETENTION_DAYS", 90)).toBe(30)
	})

	it("computes the cutoff that many days back", () => {
		expect(cutoffForRetention(2, 5 * 86400000).getTime()).toBe(3 * 86400000)
	})
})
