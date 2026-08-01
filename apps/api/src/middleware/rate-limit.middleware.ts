import rateLimit, {
	ClientRateLimitInfo,
	MemoryStore,
	Options,
	RateLimitRequestHandler,
	Store,
} from "express-rate-limit"
import { redisClient } from "../lib/redis"
import { logger } from "../lib/logger"

export class RedisWithMemoryFallbackStore implements Store {
	private readonly memoryStore = new MemoryStore()
	private windowMs = 60000

	constructor(
		private readonly keyPrefix: string,
		private readonly redisIsReady: () => boolean = () => redisClient.isReady
	) {}

	init(options: Options): void {
		this.windowMs = options.windowMs
		this.memoryStore.init(options)
	}

	private redisKey(key: string): string {
		return this.keyPrefix + key
	}

	async increment(key: string): Promise<ClientRateLimitInfo> {
		if (this.redisIsReady()) {
			try {
				const redisKey = this.redisKey(key)
				const totalHits = Number(await redisClient.incr(redisKey))
				let ttlMs = Number(await redisClient.pTTL(redisKey))
				if (ttlMs < 0) {
					await redisClient.pExpire(redisKey, this.windowMs)
					ttlMs = this.windowMs
				}
				return { totalHits, resetTime: new Date(Date.now() + ttlMs) }
			} catch (error) {
				logger.warn("Rate-limit Redis increment failed, using memory store", {
					detail: error instanceof Error ? error.message : undefined,
				})
			}
		}
		return this.memoryStore.increment(key)
	}

	async decrement(key: string): Promise<void> {
		if (this.redisIsReady()) {
			await redisClient.decr(this.redisKey(key)).catch(() => undefined)
			return
		}
		await this.memoryStore.decrement(key)
	}

	async resetKey(key: string): Promise<void> {
		await this.memoryStore.resetKey(key)
		if (this.redisIsReady()) {
			await redisClient.del(this.redisKey(key)).catch(() => undefined)
		}
	}
}

const sharedStore = (prefix: string): Options["store"] =>
	new RedisWithMemoryFallbackStore(prefix)

const limiter = (
	prefix: string,
	windowMs: number,
	limit: number,
	message: string
): RateLimitRequestHandler =>
	rateLimit({
		windowMs,
		limit,
		standardHeaders: "draft-7",
		legacyHeaders: false,
		message: { message },
		store: sharedStore(prefix),
		handler: (req, res, _next, options) => {
			logger.warn("Rate limit exceeded", { path: req.path, ip: req.ip })
			res.status(options.statusCode).json(options.message)
		},
	})

const MINUTE = 60000

export const loginRateLimit = (): RateLimitRequestHandler =>
	limiter(
		"rl:login:",
		15 * MINUTE,
		10,
		"Too many sign-in attempts. Try again in a few minutes."
	)

export const registerRateLimit = (): RateLimitRequestHandler =>
	limiter(
		"rl:register:",
		60 * MINUTE,
		5,
		"Too many accounts created from this address. Try again later."
	)

export const passwordResetRateLimit = (): RateLimitRequestHandler =>
	limiter(
		"rl:reset:",
		60 * MINUTE,
		5,
		"Too many password reset requests. Try again later."
	)

export const shareLinkRateLimit = (): RateLimitRequestHandler =>
	limiter(
		"rl:share:",
		15 * MINUTE,
		30,
		"Too many share link attempts. Try again in a few minutes."
	)

export const writeRateLimit = (): RateLimitRequestHandler =>
	limiter(
		"rl:write:",
		MINUTE,
		120,
		"You are sending requests too quickly. Slow down and try again."
	)
