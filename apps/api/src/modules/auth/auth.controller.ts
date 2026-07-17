import { Request, Response } from "express"
import { registerUser, loginUser } from "./auth.service"
import { Prisma } from "@prisma/client"
import jwt from "jsonwebtoken"
import { oauthProviders } from "./passport"
import { AuthenticatedUser } from "../../types"
import { recordAudit, requestIp } from "../audit/audit.service"

const FRONTEND_URL =
	process.env.FRONTEND_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"http://localhost:3000"

// Sets the auth cookie for a user id (shared by password + OAuth login).
const setAuthCookie = (res: Response, userId: string) => {
	const token = jwt.sign({ id: userId }, process.env.JWT_SECRET || "your_jwt_secret", {
		expiresIn: "1h",
	})
	const isProduction = process.env.NODE_ENV === "production"
	res.cookie("token", token, {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "none" : "lax",
		maxAge: 3600000,
	})
}

export const register = async (req: Request, res: Response) => {
	try {
		const user = await registerUser(req.body)
		await recordAudit({
			action: "user.registered",
			targetType: "user",
			targetId: user.id,
			actorId: user.id,
			ipAddress: requestIp(req),
		})
		return res.status(201).json({ message: "User created successfully", user })
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			return res.status(409).json({ message: "Email already exists." })
		}
		return res.status(500).json({ message: "Error creating user", error })
	}
}

export const login = async (req: Request, res: Response) => {
	try {
		const user = await loginUser(req.body)
		if (!user) {
			await recordAudit({
				action: "user.login_failed",
				targetType: "user",
				metadata: { email: req.body?.email },
				ipAddress: requestIp(req),
			})
			return res.status(401).json({ message: "Invalid credentials" })
		}

		setAuthCookie(res, user.id)
		await recordAudit({
			action: "user.login_succeeded",
			targetType: "user",
			targetId: user.id,
			actorId: user.id,
			ipAddress: requestIp(req),
		})

		return res.status(200).json({ message: "Logged in successfully" })
	} catch (error) {
		return res.status(500).json({ message: "Error logging in", error })
	}
}

export const logout = (_req: Request, res: Response) => {
	res.clearCookie("token")
	return res.status(200).json({ message: "Logged out successfully" })
}

// Lists which OAuth providers are configured so the UI can render buttons.
export const getOAuthProviders = (_req: Request, res: Response) => {
	return res.status(200).json(oauthProviders)
}

// Final step of the OAuth dance: passport has attached req.user; we mint our
// own JWT cookie and bounce the browser back to the frontend callback page.
export const oauthCallback = (req: Request, res: Response) => {
	const user = req.user as AuthenticatedUser | undefined
	if (!user) {
		return res.redirect(`${FRONTEND_URL}/login?error=oauth`)
	}
	setAuthCookie(res, user.id)
	void recordAudit({
		action: "user.oauth_login",
		targetType: "user",
		targetId: user.id,
		actorId: user.id,
		ipAddress: requestIp(req),
	})
	return res.redirect(`${FRONTEND_URL}/oauth/callback`)
}
