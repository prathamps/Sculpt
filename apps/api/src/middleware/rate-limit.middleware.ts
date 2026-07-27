import rateLimit, { Options, RateLimitRequestHandler } from "express-rate-limit"
import { RedisStore } from "rate-limit-redis"
import { redisClient } from "../lib/redis"
import { logger } from "../lib/logger"

const sharedStore = (prefix: string): Options["store"] | undefined => {
	if (!redisClient.isReady) return undefined
	return new RedisStore({
		prefix,
		sendCommand: (...args: string[]) =>
			redisClient.sendCommand(args) as Promise<never>,
	})
}

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

export const writeRateLimit = (): RateLimitRequestHandler =>
	limiter(
		"rl:write:",
		MINUTE,
		120,
		"You are sending requests too quickly. Slow down and try again."
	)
