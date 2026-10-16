import { CookieOptions, Response } from "express"
import { usesSecureCookies } from "./config"

export const SESSION_COOKIE = "token"
export const ADMIN_SESSION_COOKIE = "admin_token"
export const MFA_CHALLENGE_COOKIE = "mfa_challenge"

const sessionCookieAttributes = (): CookieOptions => ({
	httpOnly: true,
	secure: usesSecureCookies(),
	sameSite: usesSecureCookies() ? "none" : "lax",
	path: "/",
})

export const setSessionCookie = (
	res: Response,
	name: string,
	token: string,
	maxAgeMs: number
): void => {
	res.cookie(name, token, { ...sessionCookieAttributes(), maxAge: maxAgeMs })
}

export const clearSessionCookie = (res: Response, name: string): void => {
	res.clearCookie(name, sessionCookieAttributes())
}
