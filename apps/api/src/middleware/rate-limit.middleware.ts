import { Request, RequestHandler } from "express"
import rateLimit, {
	ClientRateLimitInfo,
	ipKeyGenerator,
	MemoryStore,
	Options,
	RateLimitRequestHandler,
	Store,
} from "express-rate-limit"
import { redisClient } from "../lib/redis"
import { logger } from "../lib/logger"
import { MFA_CHALLENGE_COOKIE } from "../lib/cookies"
import { verifyMfaChallenge } from "../lib/tokens"

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

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export const isReadOnlyRequest = (req: Request): boolean =>
	READ_ONLY_METHODS.has(req.method)

export const callerKey = (req: Request): string => {
	const userId = (req.user as { id?: string } | undefined)?.id
	return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? "")}`
}

const sharedStore = (prefix: string): Options["store"] =>
	new RedisWithMemoryFallbackStore(prefix)

const limiter = (
	prefix: string,
	windowMs: number,
	limit: number,
	message: string,
	overrides: Partial<Options> = {}
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
		...overrides,
	})

const MINUTE = 60000

const SIGN_IN_ATTEMPTS_PER_ACCOUNT = 10
const SIGN_IN_ATTEMPTS_PER_NETWORK = 300

const accountOf = (req: Request): string => {
	const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
	if (email) return email
	const challenged = verifyMfaChallenge(req.cookies?.[MFA_CHALLENGE_COOKIE])?.id
	if (challenged) return `challenge:${challenged}`
	return (req.user as { id?: string } | undefined)?.id ?? ""
}

export const signInAttemptKey = (req: Request): string =>
	`${ipKeyGenerator(req.ip ?? "")}|${accountOf(req)}`

export const loginRateLimit = (): RequestHandler[] => [
	limiter(
		"rl:login-network:",
		15 * MINUTE,
		SIGN_IN_ATTEMPTS_PER_NETWORK,
		"Too many sign-in attempts from your network. Try again in a few minutes."
	),
	limiter(
		"rl:login:",
		15 * MINUTE,
		SIGN_IN_ATTEMPTS_PER_ACCOUNT,
		"Too many sign-in attempts. Try again in a few minutes.",
		{ keyGenerator: signInAttemptKey }
	),
]

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
		"You are sending requests too quickly. Slow down and try again.",
		{ skip: isReadOnlyRequest, keyGenerator: callerKey }
	)
