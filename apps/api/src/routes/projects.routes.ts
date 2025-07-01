import { Router } from "express"
import * as projectController from "../controllers/projects.controller"
import { authenticateJWT } from "../middleware/auth.middleware"
import { projectImagesRouter } from "./images.routes"

const router = Router()

router.use(authenticateJWT)

router.post("/", projectController.createProject)
router.get("/", projectController.getProjects)
router.get("/:id", projectController.getProject)
router.put("/:id", projectController.updateProject)
router.delete("/:id", projectController.deleteProject)
router.post("/:id/invite", projectController.inviteToProject)
router.delete(
	"/:projectId/members/:userId",
	projectController.removeMemberFromProject
)

// Share links
router.post("/:projectId/share-links", projectController.createShareLink)
router.get("/:projectId/share-links", projectController.getShareLinks)
router.delete(
	"/:projectId/share-links/:linkId",
	projectController.revokeShareLink
)

// Mount the project-specific image routes
router.use("/:projectId/images", projectImagesRouter)

export default router
