import { describe, expect, it } from "vitest"
import { SessionClaims } from "../../lib/tokens"
import {
	USER_SESSION_LIFETIME_MS,
	absoluteSessionLifetimeMs,
	shouldSlideSession,
} from "./session.service"

const NOW = 1_700_000_000_000

const claims = (overrides: Partial<SessionClaims> = {}): SessionClaims => ({
	id: "u1",
	typ: "user",
	ver: 0,
	jti: "j1",
	sst: NOW,
	exp: (NOW + USER_SESSION_LIFETIME_MS) / 1000,
	...overrides,
})

describe("shouldSlideSession", () => {
	it("leaves a freshly issued session alone", () => {
		expect(shouldSlideSession(claims(), NOW)).toBe(false)
	})

	it("renews once the token is past half its life", () => {
		const past = NOW + USER_SESSION_LIFETIME_MS / 2 + 1000
		expect(shouldSlideSession(claims(), past)).toBe(true)
	})

	it("stops renewing after the absolute lifetime elapses", () => {
		const startedLongAgo = NOW - absoluteSessionLifetimeMs() - 1000
		const stale = claims({
			sst: startedLongAgo,
			exp: (NOW + 1000) / 1000,
		})
		expect(shouldSlideSession(stale, NOW)).toBe(false)
	})

	it("renews a long-lived but still-capped session", () => {
		const startedRecently = NOW - absoluteSessionLifetimeMs() + 60000
		const active = claims({
			sst: startedRecently,
			exp: (NOW + 1000) / 1000,
		})
		expect(shouldSlideSession(active, NOW)).toBe(true)
	})

	it("renews when the token carries no expiry", () => {
		expect(shouldSlideSession(claims({ exp: undefined }), NOW)).toBe(true)
	})
})
