import { describe, expect, it, vi, beforeEach } from "vitest"
import { Options } from "express-rate-limit"

const redisState = { isReady: false }
const incr = vi.fn()
const pTTL = vi.fn()
const pExpire = vi.fn()
const decr = vi.fn()
const del = vi.fn()

vi.mock("../lib/redis", () => ({
	redisClient: {
		get isReady() {
			return redisState.isReady
		},
		incr: (key: string) => incr(key),
		pTTL: (key: string) => pTTL(key),
		pExpire: (key: string, ms: number) => pExpire(key, ms),
		decr: (key: string) => decr(key),
		del: (key: string) => del(key),
	},
}))

vi.mock("../lib/logger", () => ({
	logger: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}))

import { RedisWithMemoryFallbackStore } from "./rate-limit.middleware"

const makeStore = () => {
	const store = new RedisWithMemoryFallbackStore("rl:test:")
	store.init({ windowMs: 60000 } as Options)
	return store
}

beforeEach(() => {
	vi.clearAllMocks()
	redisState.isReady = false
})

describe("RedisWithMemoryFallbackStore", () => {
	it("counts in memory while Redis is not connected", async () => {
		const store = makeStore()

		expect((await store.increment("1.2.3.4")).totalHits).toBe(1)
		expect((await store.increment("1.2.3.4")).totalHits).toBe(2)
		expect(incr).not.toHaveBeenCalled()
	})

	it("counts in Redis once the client reports ready", async () => {
		redisState.isReady = true
		incr.mockResolvedValue(5)
		pTTL.mockResolvedValue(30000)
		const store = makeStore()

		const result = await store.increment("1.2.3.4")

		expect(result.totalHits).toBe(5)
		expect(incr).toHaveBeenCalledWith("rl:test:1.2.3.4")
		expect(pExpire).not.toHaveBeenCalled()
	})

	it("sets the window expiry when the key has none", async () => {
		redisState.isReady = true
		incr.mockResolvedValue(1)
		pTTL.mockResolvedValue(-1)
		const store = makeStore()

		await store.increment("1.2.3.4")

		expect(pExpire).toHaveBeenCalledWith("rl:test:1.2.3.4", 60000)
	})

	it("falls back to memory when a Redis command fails mid-flight", async () => {
		redisState.isReady = true
		incr.mockRejectedValue(new Error("connection reset"))
		const store = makeStore()

		const result = await store.increment("1.2.3.4")

		expect(result.totalHits).toBe(1)
	})
})
