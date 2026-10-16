import { Socket } from "socket.io"
import { parse } from "cookie"
import { SESSION_COOKIE } from "../lib/cookies"
import { userForSession } from "../modules/auth/session.service"
import { verifySessionToken } from "../lib/tokens"
import { everyoneMfaRequired, hasMfa } from "../modules/auth/mfa.service"

export interface SocketUser {
	id: string
	name: string | null
	email: string
	avatarUrl: string | null
}

export const resolveSocketUser = async (
	socket: Socket
): Promise<SocketUser | null> => {
	try {
		const cookieHeader = socket.handshake.headers.cookie
		if (!cookieHeader) return null
		const claims = verifySessionToken(parse(cookieHeader)[SESSION_COOKIE], "user")
		if (!claims) return null
		const user = await userForSession(claims)
		if (!user) return null
		if (everyoneMfaRequired() && !hasMfa(user)) return null
		return {
			id: user.id,
			name: user.name,
			email: user.email,
			avatarUrl: user.avatarUrl,
		}
	} catch {
		return null
	}
}

export const socketAuth = async (
	socket: Socket,
	next: (err?: Error) => void
): Promise<void> => {
	const user = await resolveSocketUser(socket)
	if (!user) {
		next(new Error("Unauthorized"))
		return
	}
	socket.data.user = user
	next()
}
