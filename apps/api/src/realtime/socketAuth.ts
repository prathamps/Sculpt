import { Socket } from "socket.io"
import jwt from "jsonwebtoken"
import { parse } from "cookie"
import { prisma } from "../lib/prisma"

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
		const token = parse(cookieHeader)["token"]
		if (!token) return null
		const payload = jwt.verify(
			token,
			process.env.JWT_SECRET || "your_jwt_secret"
		) as { id?: string }
		if (!payload.id) return null
		return await prisma.user.findUnique({
			where: { id: payload.id },
			select: { id: true, name: true, email: true, avatarUrl: true },
		})
	} catch {
		return null
	}
}

export const socketAuth = async (
	socket: Socket,
	next: (err?: Error) => void
): Promise<void> => {
	socket.data.user = await resolveSocketUser(socket)
	next()
}
