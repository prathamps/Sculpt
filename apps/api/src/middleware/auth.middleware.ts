import passport from "passport"
import { Request, Response, NextFunction } from "express"
import { UserRole } from "@prisma/client"
import jwt from "jsonwebtoken"
import { prisma } from "../lib/prisma"
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
	const adminToken = req.cookies.admin_token

	if (!adminToken) {
		return res.status(401).json({ message: "Admin authentication required" })
	}

	try {
		const decoded = jwt.verify(
			adminToken,
			process.env.JWT_SECRET || "your_jwt_secret"
		) as { id: string }

		const admin = await prisma.user.findUnique({
			where: { id: decoded.id },
		})

		if (!admin || admin.role !== UserRole.ADMIN) {
			return res.status(403).json({ message: "Admin privileges required" })
		}

		req.user = admin
		return next()
	} catch {
		return res.status(401).json({ message: "Invalid admin token" })
	}
}

export const adminOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	const user = req.user as AuthenticatedUser
	if (!user || user.role !== UserRole.ADMIN) {
		return res.status(403).json({ message: "Forbidden: Admin access required" })
	}
	return next()
}
