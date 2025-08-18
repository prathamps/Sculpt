import { Request, Response } from "express"
import { registerUser, loginUser } from "../services/auth.service"
import { Prisma } from "@prisma/client"
import jwt from "jsonwebtoken"

export const register = async (req: Request, res: Response) => {
	try {
		const user = await registerUser(req.body)
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
			return res.status(401).json({ message: "Invalid credentials" })
		}

		const token = jwt.sign(
			{ id: user.id },
			process.env.JWT_SECRET || "your_jwt_secret",
			{
				expiresIn: "1h",
			}
		)

		const isProduction = process.env.NODE_ENV === "production"

		res.cookie("token", token, {
			httpOnly: true,
			secure: isProduction,
			sameSite: isProduction ? "none" : "lax",
			maxAge: 3600000, // 1 hour
		})

		return res.status(200).json({ message: "Logged in successfully" })
	} catch (error) {
		return res.status(500).json({ message: "Error logging in", error })
	}
}

export const logout = (res: Response) => {
	res.clearCookie("token")
	return res.status(200).json({ message: "Logged out successfully" })
}
