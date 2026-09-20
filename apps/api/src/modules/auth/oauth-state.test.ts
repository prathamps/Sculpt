import { describe, expect, it, vi } from "vitest"
import { Request } from "express"
import {
	CookieOAuthStateStore,
	OAUTH_STATE_COOKIE,
	matchesIssuedState,
} from "./oauth-state"

const requestWith = (cookies: Record<string, string> = {}) => {
	const res = { cookie: vi.fn(), clearCookie: vi.fn() }
	return {
		req: { cookies, res } as unknown as Request,
		res,
	}
}

describe("matchesIssuedState", () => {
	it("accepts an exact match", () => {
		expect(matchesIssuedState("abc123", "abc123")).toBe(true)
	})

	it("rejects a mismatch, a missing cookie and a length change", () => {
		expect(matchesIssuedState("abc123", "abc124")).toBe(false)
		expect(matchesIssuedState("abc123", undefined)).toBe(false)
		expect(matchesIssuedState(undefined, "abc123")).toBe(false)
		expect(matchesIssuedState("abc123", "abc1234")).toBe(false)
		expect(matchesIssuedState("", "")).toBe(false)
	})
})

describe("CookieOAuthStateStore", () => {
	const store = new CookieOAuthStateStore()

	it("issues an unguessable state and stores it in an httpOnly cookie", async () => {
		const { req, res } = requestWith()
		const state = await new Promise<string>((resolve, reject) =>
			store.store(req, (error, value) =>
				error ? reject(error) : resolve(value as string)
			)
		)

		expect(state).toMatch(/^[0-9a-f]{64}$/)
		expect(res.cookie).toHaveBeenCalledWith(
			OAUTH_STATE_COOKIE,
			state,
			expect.objectContaining({ httpOnly: true, sameSite: "lax" })
		)
	})

	it("verifies a callback that carries the issued state", async () => {
		const { req, res } = requestWith({ [OAUTH_STATE_COOKIE]: "issued-state" })

		const ok = await new Promise<boolean>((resolve) =>
			store.verify(req, "issued-state", (_error, result) =>
				resolve(result as boolean)
			)
		)

		expect(ok).toBe(true)
		expect(res.clearCookie).toHaveBeenCalledWith(
			OAUTH_STATE_COOKIE,
			expect.any(Object)
		)
	})

	it("rejects a forged callback with no matching cookie", async () => {
		const { req } = requestWith()

		const ok = await new Promise<boolean>((resolve) =>
			store.verify(req, "attacker-state", (_error, result) =>
				resolve(result as boolean)
			)
		)

		expect(ok).toBe(false)
	})

	it("rejects a callback whose state does not match the cookie", async () => {
		const { req } = requestWith({ [OAUTH_STATE_COOKIE]: "issued-state" })

		const ok = await new Promise<boolean>((resolve) =>
			store.verify(req, "attacker-state", (_error, result) =>
				resolve(result as boolean)
			)
		)

		expect(ok).toBe(false)
	})

	it("clears the state cookie so it cannot be replayed", async () => {
		const { req, res } = requestWith({ [OAUTH_STATE_COOKIE]: "issued-state" })

		await new Promise<void>((resolve) =>
			store.verify(req, "issued-state", () => resolve())
		)

		expect(res.clearCookie).toHaveBeenCalledTimes(1)
	})
})
