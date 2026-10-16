import { describe, expect, it, vi } from "vitest"
import { TtlCache, cachePositive } from "./ttl-cache"

const clock = (start = 0) => {
	let time = start
	return { now: () => time, advance: (ms: number) => (time += ms) }
}

describe("TtlCache", () => {
	it("serves a value until its time to live runs out", () => {
		const time = clock()
		const cache = new TtlCache<string>(1000, 10, time.now)

		cache.set("k", "v")
		time.advance(999)
		expect(cache.get("k")).toBe("v")
		time.advance(1)
		expect(cache.get("k")).toBeUndefined()
	})

	it("evicts the oldest entry once full", () => {
		const cache = new TtlCache<number>(1000, 2)

		cache.set("a", 1)
		cache.set("b", 2)
		cache.set("c", 3)

		expect(cache.get("a")).toBeUndefined()
		expect(cache.get("b")).toBe(2)
		expect(cache.get("c")).toBe(3)
	})

	it("drops every entry matching a predicate", () => {
		const cache = new TtlCache<{ userId: string }>(1000)
		cache.set("s1", { userId: "u1" })
		cache.set("s2", { userId: "u1" })
		cache.set("s3", { userId: "u2" })

		cache.deleteWhere((value) => value.userId === "u1")

		expect(cache.size).toBe(1)
		expect(cache.get("s3")).toEqual({ userId: "u2" })
	})
})

describe("cachePositive", () => {
	it("loads once while the answer is cached", async () => {
		const cache = new TtlCache<string>(1000)
		const load = vi.fn().mockResolvedValue("OWNER")

		await cachePositive(cache, "k", load)
		await cachePositive(cache, "k", load)

		expect(load).toHaveBeenCalledTimes(1)
	})

	it("never caches a missing answer, so a fresh grant is seen immediately", async () => {
		const cache = new TtlCache<string>(1000)
		const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("VIEWER")

		expect(await cachePositive(cache, "k", load)).toBeNull()
		expect(await cachePositive(cache, "k", load)).toBe("VIEWER")
	})
})
