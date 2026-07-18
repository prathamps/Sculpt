import { Router } from "express"
import {
	getUsers,
	changeUserRole,
	getProjects,
	getProject,
	getStats,
	getAuditLogs,
	adminLogin,
	adminProfile,
	adminLogout,
} from "./admin.controller"
import { authenticateAdmin } from "../../middleware/auth.middleware"

const router = Router()

router.post("/login", adminLogin)
router.post("/logout", adminLogout)

router.use(authenticateAdmin)

router.get("/profile", adminProfile)

router.get("/users", getUsers)
router.patch("/users/:userId/role", changeUserRole)

router.get("/projects", getProjects)
router.get("/projects/:projectId", getProject)

router.get("/stats", getStats)

router.get("/audit-logs", getAuditLogs)

export default router
