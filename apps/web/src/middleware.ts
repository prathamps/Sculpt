import { NextRequest, NextResponse } from "next/server"

const SESSION_COOKIE = "token"
const ADMIN_SESSION_COOKIE = "admin_token"

const PROTECTED_PREFIXES = ["/dashboard", "/project", "/account"]
const ADMIN_PREFIXES = ["/admin"]
const SIGNED_OUT_ONLY = ["/login", "/register"]

const startsWithAny = (pathname: string, prefixes: string[]): boolean =>
	prefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	)

const redirectTo = (
	request: NextRequest,
	pathname: string,
	returnTo?: string
): NextResponse => {
	const url = request.nextUrl.clone()
	url.pathname = pathname
	url.search = returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""
	return NextResponse.redirect(url)
}

export const middleware = (request: NextRequest): NextResponse => {
	const { pathname, search } = request.nextUrl
	const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value
	const hasAdminSession = !!request.cookies.get(ADMIN_SESSION_COOKIE)?.value

	if (startsWithAny(pathname, ADMIN_PREFIXES) && !hasAdminSession) {
		return redirectTo(request, "/admin-login")
	}

	if (startsWithAny(pathname, PROTECTED_PREFIXES) && !hasSession) {
		return redirectTo(request, "/login", `${pathname}${search}`)
	}

	if (startsWithAny(pathname, SIGNED_OUT_ONLY) && hasSession) {
		return redirectTo(request, "/dashboard")
	}

	return NextResponse.next()
}

export const config = {
	matcher: [
		"/dashboard/:path*",
		"/project/:path*",
		"/account/:path*",
		"/admin/:path*",
		"/login",
		"/register",
	],
}
