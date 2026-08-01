import { CookieOptions, Response } from "express"
import { isProduction } from "./config"

export const SESSION_COOKIE = "token"
export const ADMIN_SESSION_COOKIE = "admin_token"

const sessionCookieAttributes = (): CookieOptions => ({
	httpOnly: true,
	secure: isProduction(),
	sameSite: isProduction() ? "none" : "lax",
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
