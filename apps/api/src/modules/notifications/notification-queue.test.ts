import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/logger", () => ({
	logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { logger } from "../../lib/logger"
import { createDeliveryQueue } from "./notification-queue"

const deferred = () => {
	let release!: () => void
	const promise = new Promise<void>((resolve) => {
		release = resolve
	})
	return { promise, release }
}

describe("createDeliveryQueue", () => {
	it("returns to the caller without waiting for delivery", async () => {
		const gate = deferred()
		const started: string[] = []
		const queue = createDeliveryQueue<string>({
			name: "test",
			concurrency: 1,
			run: async (job) => {
				started.push(job)
				await gate.promise
			},
		})

		queue.enqueue("a")
		expect(queue.depth()).toBe(1)

		gate.release()
		await queue.drained()
		expect(started).toEqual(["a"])
		expect(queue.depth()).toBe(0)
	})

	it("never runs more jobs at once than its concurrency allows", async () => {
		const gate = deferred()
		let running = 0
		let peak = 0
		const queue = createDeliveryQueue<number>({
			name: "test",
			concurrency: 2,
			run: async () => {
				running++
				peak = Math.max(peak, running)
				await gate.promise
				running--
			},
		})

		for (let i = 0; i < 6; i++) queue.enqueue(i)
		expect(peak).toBe(2)

		gate.release()
		await queue.drained()
		expect(peak).toBe(2)
	})

	it("delivers every queued job", async () => {
		const delivered: number[] = []
		const queue = createDeliveryQueue<number>({
			name: "test",
			concurrency: 3,
			run: async (job) => {
				delivered.push(job)
			},
		})

		for (let i = 0; i < 50; i++) queue.enqueue(i)
		await queue.drained()

		expect(delivered.sort((a, b) => a - b)).toEqual(
			Array.from({ length: 50 }, (_, i) => i)
		)
	})

	it("keeps draining after a delivery throws", async () => {
		const delivered: number[] = []
		const queue = createDeliveryQueue<number>({
			name: "test",
			concurrency: 1,
			run: async (job) => {
				if (job === 1) throw new Error("smtp refused")
				delivered.push(job)
			},
		})

		queue.enqueue(0)
		queue.enqueue(1)
		queue.enqueue(2)
		await queue.drained()

		expect(delivered).toEqual([0, 2])
		expect(logger.error).toHaveBeenCalled()
	})

	it("sheds work rather than growing without bound", async () => {
		const gate = deferred()
		const delivered: number[] = []
		const queue = createDeliveryQueue<number>({
			name: "test",
			concurrency: 1,
			maxDepth: 2,
			run: async (job) => {
				await gate.promise
				delivered.push(job)
			},
		})

		for (let i = 0; i < 10; i++) queue.enqueue(i)

		gate.release()
		await queue.drained()

		expect(delivered.length).toBeLessThanOrEqual(3)
		expect(logger.warn).toHaveBeenCalledWith(
			"Notification queue is full, dropping deliveries",
			expect.objectContaining({ queue: "test", maxDepth: 2 })
		)
	})

	it("resolves drained immediately when nothing is queued", async () => {
		const queue = createDeliveryQueue<number>({
			name: "test",
			concurrency: 1,
			run: async () => undefined,
		})

		await expect(queue.drained()).resolves.toBeUndefined()
	})
})
