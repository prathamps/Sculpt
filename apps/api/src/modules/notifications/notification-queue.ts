import { logger } from "../../lib/logger"

const DEFAULT_CONCURRENCY = 4
const DEFAULT_MAX_DEPTH = 10000

export interface DeliveryQueue<TJob> {
	enqueue: (job: TJob) => void
	depth: () => number
	drained: () => Promise<void>
}

const configuredConcurrency = (): number =>
	Math.max(1, Number(process.env.NOTIFICATION_WORKER_CONCURRENCY) || DEFAULT_CONCURRENCY)

const configuredMaxDepth = (): number =>
	Math.max(1, Number(process.env.NOTIFICATION_QUEUE_MAX_DEPTH) || DEFAULT_MAX_DEPTH)

export const createDeliveryQueue = <TJob>(options: {
	name: string
	run: (job: TJob) => Promise<void>
	concurrency?: number
	maxDepth?: number
}): DeliveryQueue<TJob> => {
	const concurrency = options.concurrency ?? configuredConcurrency()
	const maxDepth = options.maxDepth ?? configuredMaxDepth()
	const waiting: TJob[] = []
	const idleWaiters: (() => void)[] = []
	let active = 0
	let discarded = 0

	const releaseIdleWaiters = (): void => {
		if (waiting.length > 0 || active > 0) return
		while (idleWaiters.length > 0) idleWaiters.shift()?.()
	}

	const drain = (): void => {
		while (active < concurrency && waiting.length > 0) {
			const job = waiting.shift()
			if (!job) break
			active += 1
			void options
				.run(job)
				.catch((error) =>
					logger.error("Notification delivery failed", error, {
						queue: options.name,
					})
				)
				.finally(() => {
					active -= 1
					drain()
					releaseIdleWaiters()
				})
		}
	}

	return {
		enqueue: (job: TJob) => {
			if (waiting.length >= maxDepth) {
				discarded += 1
				if (discarded % 100 === 1) {
					logger.warn("Notification queue is full, dropping deliveries", {
						queue: options.name,
						maxDepth,
						discarded,
					})
				}
				return
			}
			waiting.push(job)
			drain()
		},
		depth: () => waiting.length + active,
		drained: () =>
			waiting.length === 0 && active === 0
				? Promise.resolve()
				: new Promise<void>((resolve) => idleWaiters.push(resolve)),
	}
}
