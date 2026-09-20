import { randomBytes, timingSafeEqual } from "crypto"
import { CookieOptions, Request, Response } from "express"
import {
	Metadata,
	StateStore,
	StateStoreStoreCallback,
	StateStoreVerifyCallback,
} from "passport-oauth2"
import { isProduction } from "../../lib/config"

export const OAUTH_STATE_COOKIE = "oauth_state"

const STATE_BYTES = 32
const STATE_TTL_MS = 10 * 60000

const stateCookieAttributes = (): CookieOptions => ({
	httpOnly: true,
	secure: isProduction(),
	sameSite: "lax",
	path: "/",
})

export const issueStateValue = (): string =>
	randomBytes(STATE_BYTES).toString("hex")

export const matchesIssuedState = (
	presented: unknown,
	issued: unknown
): boolean => {
	if (typeof presented !== "string" || typeof issued !== "string") return false
	if (presented.length === 0 || presented.length !== issued.length) return false
	return timingSafeEqual(Buffer.from(presented), Buffer.from(issued))
}

const responseOf = (req: Request): Response | undefined =>
	req.res as Response | undefined

export class CookieOAuthStateStore implements StateStore {
	store(req: Request, callback: StateStoreStoreCallback): void
	store(req: Request, meta: Metadata, callback: StateStoreStoreCallback): void
	store(
		req: Request,
		metaOrCallback: Metadata | StateStoreStoreCallback,
		maybeCallback?: StateStoreStoreCallback
	): void {
		const callback =
			typeof metaOrCallback === "function" ? metaOrCallback : maybeCallback
		if (!callback) return

		const res = responseOf(req)
		if (!res) {
			callback(new Error("OAuth state cannot be stored without a response"), null)
			return
		}

		const state = issueStateValue()
		res.cookie(OAUTH_STATE_COOKIE, state, {
			...stateCookieAttributes(),
			maxAge: STATE_TTL_MS,
		})
		callback(null, state)
	}

	verify(req: Request, state: string, callback: StateStoreVerifyCallback): void
	verify(
		req: Request,
		state: string,
		meta: Metadata,
		callback: StateStoreVerifyCallback
	): void
	verify(
		req: Request,
		state: string,
		metaOrCallback: Metadata | StateStoreVerifyCallback,
		maybeCallback?: StateStoreVerifyCallback
	): void {
		const callback =
			typeof metaOrCallback === "function" ? metaOrCallback : maybeCallback
		if (!callback) return

		const issued = req.cookies?.[OAUTH_STATE_COOKIE]
		responseOf(req)?.clearCookie(OAUTH_STATE_COOKIE, stateCookieAttributes())

		if (!matchesIssuedState(state, issued)) {
			callback(null, false, {
				message: "Sign-in could not be verified. Start again from Sculpt.",
			})
			return
		}
		callback(null, true, null)
	}
}
