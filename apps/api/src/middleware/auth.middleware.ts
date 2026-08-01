import passport from "passport"
import { Request, Response, NextFunction } from "express"
import { UserRole } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { ADMIN_SESSION_COOKIE } from "../lib/cookies"
import { authenticateSessionToken } from "../modules/auth/session.service"
import { AuthenticatedRequest, AuthenticatedUser } from "../types"

export const authenticateJWT = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	passport.authenticate(
		"jwt",
		{ session: false },
		(err: Error, user: Express.User) => {
			if (err) {
				return next(err)
			}
			if (!user) {
				return res.status(401).json({ message: "Unauthorized" })
			}
			req.user = user as AuthenticatedUser
			next()
		}
	)(req, res, next)
}

export const authenticateAdmin = async (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction
) => {
	const claims = await authenticateSessionToken(
		req.cookies?.[ADMIN_SESSION_COOKIE],
		"admin"
	)

	if (!claims) {
		return res.status(401).json({ message: "Admin authentication required" })
	}

	const admin = await prisma.user.findUnique({ where: { id: claims.id } })

	if (!admin || admin.tokenVersion !== claims.ver) {
		return res.status(401).json({ message: "Admin session is no longer valid" })
	}

	if (admin.role !== UserRole.ADMIN) {
		return res.status(403).json({ message: "Admin privileges required" })
	}

	req.user = admin
	return next()
}

export const adminOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	const user = req.user as AuthenticatedUser
	if (!user || user.role !== UserRole.ADMIN) {
		return res.status(403).json({ message: "Forbidden: Admin access required" })
	}
	return next()
}
