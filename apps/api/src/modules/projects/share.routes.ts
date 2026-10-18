import { Router } from "express"
import * as projectController from "./projects.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { shareLinkRateLimit } from "../../middleware/rate-limit.middleware"
import { requireScope } from "../../middleware/scope.middleware"

const router = Router()

router.post(
	"/:token",
	shareLinkRateLimit(),
	authenticateJWT,
	requireScope("sculpt:manage"),
	projectController.joinProjectWithShareLink
)

export default router
