import passport from "passport"
import { Request, Response, NextFunction } from "express"
import { UserRole } from "@prisma/client"
import jwt from "jsonwebtoken"
import { prisma } from "../lib/prisma"

export const authenticateJWT = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	passport.authenticate(
		"jwt",
		{ session: false },
		(err: any, user: any, info: any) => {
			if (err) {
				return next(err)
			}
			if (!user) {
				return res.status(401).json({ message: "Unauthorized" })
			}
			req.user = user
			next()
		}
	)(req, res, next)
}

// Middleware specifically for admin authentication
export const authenticateAdmin = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const adminToken = req.cookies.admin_token

	if (!adminToken) {
		return res.status(401).json({ message: "Admin authentication required" })
	}

	try {
		// Verify the admin token
		const decoded = jwt.verify(
			adminToken,
			process.env.JWT_SECRET || "your_jwt_secret"
		) as { id: string }

		// Fetch admin user
		const admin = await prisma.user.findUnique({
			where: { id: decoded.id },
		})

		if (!admin || admin.role !== UserRole.ADMIN) {
			return res.status(403).json({ message: "Admin privileges required" })
		}

		// Attach admin to request
		req.user = admin
		next()
	} catch (error) {
		return res.status(401).json({ message: "Invalid admin token" })
	}
}

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
	if (!req.user || req.user.role !== UserRole.ADMIN) {
		return res.status(403).json({ message: "Forbidden: Admin access required" })
	}
	next()
}
