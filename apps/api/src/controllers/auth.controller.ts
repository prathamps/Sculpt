import { Request, Response } from "express"
import { registerUser, loginUser } from "../services/auth.service"
import { User, Prisma } from "@prisma/client"
import jwt from "jsonwebtoken"

export const register = async (req: Request, res: Response) => {
	try {
		const user = await registerUser(req.body)
		res.status(201).json({ message: "User created successfully", user })
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			return res.status(409).json({ message: "Email already exists." })
		}
		res.status(500).json({ message: "Error creating user", error })
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

		res.cookie("token", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 3600000, // 1 hour
		})

		res.status(200).json({ message: "Logged in successfully" })
	} catch (error) {
		res.status(500).json({ message: "Error logging in", error })
	}
}

export const logout = (req: Request, res: Response) => {
	res.clearCookie("token")
	res.status(200).json({ message: "Logged out successfully" })
}
