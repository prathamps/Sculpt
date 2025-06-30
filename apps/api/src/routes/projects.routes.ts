import { Router } from "express"
import * as projectController from "../controllers/projects.controller"
import * as imageController from "../controllers/images.controller"
import { authenticateJWT } from "../middleware/auth.middleware"
import { upload } from "../middleware/upload.middleware"

const router = Router()

router.use(authenticateJWT)

router.post("/", projectController.createProject)
router.get("/", projectController.getProjects)
router.get("/:id", projectController.getProject)
router.post("/:id/invite", projectController.inviteToProject)

router.post(
	"/:projectId/images",
	upload.array("images", 10),
	imageController.uploadImage
)
router.get("/:projectId/images", imageController.getProjectImages)

export default router
