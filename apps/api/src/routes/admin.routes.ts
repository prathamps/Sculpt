import { Router } from "express"
import {
	getUsers,
	changeUserRole,
	getProjects,
	getProject,
	getStats,
	adminLogin,
	adminProfile,
	adminLogout,
} from "../controllers/admin.controller"
import { authenticateAdmin, adminOnly } from "../middleware/auth.middleware"

const router = Router()

// Public admin routes (no auth required)
router.post("/login", adminLogin)
router.post("/logout", adminLogout)

// Protected admin routes
// All routes below this middleware require authentication and admin privileges
router.use(authenticateAdmin)

// Admin profile
router.get("/profile", adminProfile)

// User management
router.get("/users", getUsers)
router.patch("/users/:userId/role", changeUserRole)

// Project management
router.get("/projects", getProjects)
router.get("/projects/:projectId", getProject)

// Dashboard statistics
router.get("/stats", getStats)

export default router
