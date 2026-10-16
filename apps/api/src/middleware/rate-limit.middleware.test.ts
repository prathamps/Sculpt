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

describe("write rate limit scoping", () => {
	it("never counts reads against the write budget", async () => {
		const { isReadOnlyRequest } = await import("./rate-limit.middleware")

		expect(isReadOnlyRequest({ method: "GET" } as never)).toBe(true)
		expect(isReadOnlyRequest({ method: "POST" } as never)).toBe(false)
		expect(isReadOnlyRequest({ method: "DELETE" } as never)).toBe(false)
	})

	it("buckets signed-in callers by account so people behind one NAT do not share a limit", async () => {
		const { callerKey } = await import("./rate-limit.middleware")

		const alice = callerKey({ user: { id: "alice" }, ip: "10.0.0.1" } as never)
		const bob = callerKey({ user: { id: "bob" }, ip: "10.0.0.1" } as never)

		expect(alice).toBe("user:alice")
		expect(bob).toBe("user:bob")
	})

	it("falls back to the caller address when nobody is signed in", async () => {
		const { callerKey } = await import("./rate-limit.middleware")

		expect(callerKey({ ip: "10.0.0.1" } as never)).toBe("ip:10.0.0.1")
	})
})

describe("sign-in rate limit scoping", () => {
	it("gives each account behind a shared office address its own budget", async () => {
		const { signInAttemptKey } = await import("./rate-limit.middleware")
		const office = "203.0.113.7"

		const ada = signInAttemptKey({ ip: office, body: { email: "Ada@Example.com " }, cookies: {} } as never)
		const grace = signInAttemptKey({ ip: office, body: { email: "grace@example.com" }, cookies: {} } as never)

		expect(ada).toBe("203.0.113.7|ada@example.com")
		expect(ada).not.toBe(grace)
	})

	it("buckets an account's own settings changes by the signed-in user", async () => {
		const { signInAttemptKey } = await import("./rate-limit.middleware")

		expect(
			signInAttemptKey({ ip: "10.0.0.1", body: { code: "123456" }, cookies: {}, user: { id: "u1" } } as never)
		).toBe("10.0.0.1|u1")
	})
})
