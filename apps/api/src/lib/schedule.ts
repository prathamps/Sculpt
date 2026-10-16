import { logger } from "./logger"

export const runPeriodically = (
	label: string,
	intervalMs: number,
	task: () => Promise<unknown>,
	options: { runImmediately?: boolean } = {}
): NodeJS.Timeout => {
	let running = false
	const tick = () => {
		if (running) return
		running = true
		task()
			.catch((error) => logger.error(`${label} failed`, error))
			.finally(() => {
				running = false
			})
	}

	if (options.runImmediately) tick()

	const timer = setInterval(tick, intervalMs)
	timer.unref()
	return timer
}

const DAY_MS = 24 * 3600000

export const retentionDaysFromEnv = (
	variable: string,
	fallback: number | null
): number | null => {
	const raw = process.env[variable]?.trim()
	if (!raw) return fallback
	const days = Number(raw)
	return Number.isFinite(days) && days > 0 ? days : fallback
}

export const cutoffForRetention = (days: number, now = Date.now()): Date =>
	new Date(now - days * DAY_MS)
