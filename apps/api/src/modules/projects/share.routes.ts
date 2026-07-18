import { Router } from "express"
import * as projectController from "./projects.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"

const router = Router()

router.post(
	"/:token",
	authenticateJWT,
	projectController.joinProjectWithShareLink
)

export default router
