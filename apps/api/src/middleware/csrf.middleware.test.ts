import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Request, Response } from "express"
import { rejectCrossSiteMutations } from "./csrf.middleware"

const makeRequest = (
	method: string,
	headers: Record<string, string> = {}
): Request => ({ method, headers }) as unknown as Request

const makeResponse = () => {
	const res = {
		statusCode: 0,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code
			return this
		},
		json(payload: unknown) {
			this.body = payload
			return this
		},
	}
	return res as unknown as Response & { statusCode: number; body: unknown }
}

describe("rejectCrossSiteMutations", () => {
	beforeEach(() => {
		vi.stubEnv("FRONTEND_URL", "https://sculpt.example.com")
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it("allows safe methods regardless of origin", () => {
		const next = vi.fn()
		rejectCrossSiteMutations(
			makeRequest("GET", { origin: "https://evil.example.net" }),
			makeResponse(),
			next
		)
		expect(next).toHaveBeenCalled()
	})

	it("allows mutations from the configured frontend origin", () => {
		const next = vi.fn()
		rejectCrossSiteMutations(
			makeRequest("POST", { origin: "https://sculpt.example.com" }),
			makeResponse(),
			next
		)
		expect(next).toHaveBeenCalled()
	})

	it("allows mutations without an origin header for non-browser clients", () => {
		const next = vi.fn()
		rejectCrossSiteMutations(makeRequest("POST"), makeResponse(), next)
		expect(next).toHaveBeenCalled()
	})

	it("rejects cross-site form posts from unknown origins", () => {
		const next = vi.fn()
		const res = makeResponse()
		rejectCrossSiteMutations(
			makeRequest("POST", { origin: "https://evil.example.net" }),
			res,
			next
		)
		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(403)
	})

	it("rejects an opaque null origin", () => {
		const next = vi.fn()
		const res = makeResponse()
		rejectCrossSiteMutations(
			makeRequest("DELETE", { origin: "null" }),
			res,
			next
		)
		expect(res.statusCode).toBe(403)
	})

	it("falls back to the referer when origin is absent", () => {
		const next = vi.fn()
		const res = makeResponse()
		rejectCrossSiteMutations(
			makeRequest("POST", { referer: "https://evil.example.net/attack.html" }),
			res,
			next
		)
		expect(res.statusCode).toBe(403)

		const allowedNext = vi.fn()
		rejectCrossSiteMutations(
			makeRequest("POST", {
				referer: "https://sculpt.example.com/dashboard",
			}),
			makeResponse(),
			allowedNext
		)
		expect(allowedNext).toHaveBeenCalled()
	})
})
