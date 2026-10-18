import { Router } from "express"
import {
	getUsers,
	changeUserRole,
	getProjects,
	getProject,
	getStats,
	getAuditLogs,
	exportAuditLogs,
	verifyAuditLogs,
	adminLogin,
	adminProfile,
	adminLogout,
} from "./admin.controller"
import { authenticateAdmin } from "../../middleware/auth.middleware"
import { validateBody, validateQuery } from "../../middleware/validate.middleware"
import { auditQuerySchema } from "../audit/audit.schema"
import { adminLoginSchema } from "../auth/auth.schema"
import { loginRateLimit } from "../../middleware/rate-limit.middleware"
import { listOAuthClients, updateOAuthClient } from "../oauth/admin-clients.controller"
import { updateClientSchema } from "../oauth/oauth.schema"

const router = Router()

router.post("/login", loginRateLimit(), validateBody(adminLoginSchema), adminLogin)
router.post("/logout", adminLogout)

router.use(authenticateAdmin)

router.get("/profile", adminProfile)

router.get("/users", getUsers)
router.patch("/users/:userId/role", changeUserRole)

router.get("/projects", getProjects)
router.get("/projects/:projectId", getProject)

router.get("/stats", getStats)

router.get("/audit-logs", validateQuery(auditQuerySchema), getAuditLogs)
router.get("/audit-logs/export.csv", validateQuery(auditQuerySchema), exportAuditLogs)
router.get("/audit-logs/verify", verifyAuditLogs)

router.get("/oauth-clients", listOAuthClients)
router.patch(
	"/oauth-clients/:clientId",
	validateBody(updateClientSchema),
	updateOAuthClient
)

export default router
