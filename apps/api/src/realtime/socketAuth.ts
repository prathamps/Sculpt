import { Socket } from "socket.io"
import { parse } from "cookie"
import { prisma } from "../lib/prisma"
import { SESSION_COOKIE } from "../lib/cookies"
import { authenticateSessionToken } from "../modules/auth/session.service"

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
		const claims = await authenticateSessionToken(
			parse(cookieHeader)[SESSION_COOKIE],
			"user"
		)
		if (!claims) return null
		const user = await prisma.user.findUnique({
			where: { id: claims.id },
			select: {
				id: true,
				name: true,
				email: true,
				avatarUrl: true,
				tokenVersion: true,
			},
		})
		if (!user || user.tokenVersion !== claims.ver) return null
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
