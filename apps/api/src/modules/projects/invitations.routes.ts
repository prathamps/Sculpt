import { Router } from "express"
import * as projectController from "./projects.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { requireScope } from "../../middleware/scope.middleware"

const router = Router()

router.post(
	"/:token/accept",
	authenticateJWT,
	requireScope("sculpt:manage"),
	projectController.acceptInvitation
)

export default router
