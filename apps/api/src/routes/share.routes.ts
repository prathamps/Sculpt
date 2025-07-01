import { Router } from "express"
import * as projectController from "../controllers/projects.controller"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = Router()

// This route is authenticated because a user must be logged in to join a project
router.post(
	"/:token",
	authenticateJWT,
	projectController.joinProjectWithShareLink
)

export default router
