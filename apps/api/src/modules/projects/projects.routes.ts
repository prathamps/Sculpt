import { Router } from "express"
import * as projectController from "./projects.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { projectImagesRouter } from "../media/images.routes"

const router = Router()

router.use(authenticateJWT)

router.post("/", projectController.createProject)
router.get("/", projectController.getProjects)
router.get("/:id/my-role", projectController.getMyRole)
router.get("/:id", projectController.getProject)
router.put("/:id", projectController.updateProject)
router.delete("/:id", projectController.deleteProject)
router.post("/:id/invite", projectController.inviteToProject)
router.delete(
	"/:projectId/members/:userId",
	projectController.removeMemberFromProject
)

router.post("/:projectId/share-links", projectController.createShareLink)
router.get("/:projectId/share-links", projectController.getShareLinks)
router.delete(
	"/:projectId/share-links/:linkId",
	projectController.revokeShareLink
)

router.use("/:projectId/images", projectImagesRouter)

export default router
