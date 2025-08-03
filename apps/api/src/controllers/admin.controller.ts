import { Request, Response } from "express"
import {
	getAllUsers,
	updateUserRole,
	getAllProjects,
	getProjectById,
	getDashboardStats,
} from "../services/admin.service"
import { loginAdmin } from "../services/auth.service"
import { UserRole } from "@prisma/client"
import jwt from "jsonwebtoken"

export const adminLogin = async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body
		const admin = await loginAdmin(email, password)

		if (!admin) {
			return res.status(401).json({ message: "Invalid credentials" })
		}

		if (admin.role !== UserRole.ADMIN) {
			return res
				.status(403)
				.json({ message: "Access denied: Admin privileges required" })
		}

		// Generate JWT token
		const token = jwt.sign(
			{ id: admin.id },
			process.env.JWT_SECRET || "your_jwt_secret",
			{ expiresIn: "8h" } // Longer session for admins
		)

		// Set httpOnly cookie
		res.cookie("admin_token", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 8 * 3600000, // 8 hours
		})

		res.status(200).json({ message: "Admin logged in successfully" })
	} catch (error) {
		console.error("Admin login error:", error)
		res.status(500).json({ message: "Error during admin login" })
	}
}

export const adminProfile = async (req: Request, res: Response) => {
	// The user is already authenticated as an admin through middleware
	const admin = req.user

	if (!admin) {
		return res.status(401).json({ message: "Not authenticated" })
	}

	// Extract what we need from the user object
	const { id, email, name, role, createdAt, updatedAt } = admin as any

	res.status(200).json({
		id,
		email,
		name,
		role,
		createdAt,
		updatedAt,
	})
}

export const adminLogout = (req: Request, res: Response) => {
	res.clearCookie("admin_token")
	res.status(200).json({ message: "Admin logged out successfully" })
}

export const getUsers = async (req: Request, res: Response) => {
	try {
		const users = await getAllUsers()
		res.status(200).json(users)
	} catch (error) {
		console.error("Error fetching users:", error)
		res.status(500).json({ message: "Error fetching users" })
	}
}

export const changeUserRole = async (req: Request, res: Response) => {
	try {
		const { userId } = req.params
		const { role } = req.body

		if (!Object.values(UserRole).includes(role)) {
			return res.status(400).json({ message: "Invalid role" })
		}

		const updatedUser = await updateUserRole(userId, role)
		res.status(200).json(updatedUser)
	} catch (error) {
		console.error("Error updating user role:", error)
		res.status(500).json({ message: "Error updating user role" })
	}
}

export const getProjects = async (req: Request, res: Response) => {
	try {
		const projects = await getAllProjects()
		res.status(200).json(projects)
	} catch (error) {
		console.error("Error fetching projects:", error)
		res.status(500).json({ message: "Error fetching projects" })
	}
}

export const getProject = async (req: Request, res: Response) => {
	try {
		const { projectId } = req.params
		const project = await getProjectById(projectId)

		if (!project) {
			return res.status(404).json({ message: "Project not found" })
		}

		res.status(200).json(project)
	} catch (error) {
		console.error("Error fetching project:", error)
		res.status(500).json({ message: "Error fetching project" })
	}
}

export const getStats = async (req: Request, res: Response) => {
	try {
		const stats = await getDashboardStats()
		res.status(200).json(stats)
	} catch (error) {
		console.error("Error fetching statistics:", error)
		res.status(500).json({ message: "Error fetching statistics" })
	}
}
