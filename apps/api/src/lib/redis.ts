import { createClient } from "redis"
import { logger } from "./logger"

const RECONNECT_CEILING_MS = 30000

export const redisUrl = process.env.REDIS_URL || "redis://localhost:6379"

export const redisClient = createClient({
	url: redisUrl,
	socket: {
		reconnectStrategy: (retries) =>
			Math.min(50 * 2 ** Math.min(retries, 10), RECONNECT_CEILING_MS),
	},
})

let lastReportedState: "up" | "down" | "unknown" = "unknown"

const reportState = (state: "up" | "down", detail?: unknown): void => {
	if (lastReportedState === state) return
	lastReportedState = state
	if (state === "up") {
		logger.info("Redis connected")
		return
	}
	logger.warn("Redis unavailable, falling back to in-process behaviour", {
		detail: detail instanceof Error ? detail.message : undefined,
	})
}

redisClient.on("error", (error) => reportState("down", error))
redisClient.on("ready", () => reportState("up"))
redisClient.on("end", () => reportState("down"))

void redisClient
	.connect()
	.catch((error) =>
		logger.warn("Redis initial connection failed", {
			detail: error instanceof Error ? error.message : undefined,
		})
	)

export const isRedisReady = (): boolean => redisClient.isReady

const guarded =
	<TArgs extends unknown[], TResult>(
		operation: string,
		fallback: TResult,
		run: (...args: TArgs) => Promise<TResult>
	) =>
	async (...args: TArgs): Promise<TResult> => {
		if (!redisClient.isReady) return fallback
		try {
			return await run(...args)
		} catch (error) {
			logger.warn("Redis operation failed", {
				operation,
				detail: error instanceof Error ? error.message : undefined,
			})
			return fallback
		}
	}

const safeRedis = {
	hSet: guarded("hSet", 0, (...args: Parameters<typeof redisClient.hSet>) =>
		redisClient.hSet(...args)
	),
	hGet: guarded(
		"hGet",
		undefined as string | undefined,
		(...args: Parameters<typeof redisClient.hGet>) => redisClient.hGet(...args)
	),
	hKeys: guarded(
		"hKeys",
		[] as string[],
		(...args: Parameters<typeof redisClient.hKeys>) => redisClient.hKeys(...args)
	),
	hVals: guarded(
		"hVals",
		[] as string[],
		(...args: Parameters<typeof redisClient.hVals>) => redisClient.hVals(...args)
	),
	sAdd: guarded("sAdd", 0, (...args: Parameters<typeof redisClient.sAdd>) =>
		redisClient.sAdd(...args)
	),
	sRem: guarded("sRem", 0, (...args: Parameters<typeof redisClient.sRem>) =>
		redisClient.sRem(...args)
	),
	sCard: guarded("sCard", 0, (...args: Parameters<typeof redisClient.sCard>) =>
		redisClient.sCard(...args)
	),
	exists: guarded("exists", 0, (...args: Parameters<typeof redisClient.exists>) =>
		redisClient.exists(...args)
	),
	expire: guarded(
		"expire",
		0 as number | `${number}`,
		(...args: Parameters<typeof redisClient.expire>) => redisClient.expire(...args)
	),
	del: guarded("del", 0, (...args: Parameters<typeof redisClient.del>) =>
		redisClient.del(...args)
	),
	ping: guarded("ping", null as string | null, () => redisClient.ping()),
}

export default safeRedis
