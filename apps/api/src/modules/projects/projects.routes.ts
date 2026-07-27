import { Router } from "express"
import * as projectController from "./projects.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import { writeRateLimit } from "../../middleware/rate-limit.middleware"
import { projectImagesRouter } from "../media/images.routes"
import { projectReviewRouter } from "../reviews/reviews.routes"
import {
	changeMemberRoleSchema,
	createProjectSchema,
	createShareLinkSchema,
	inviteMemberSchema,
	updateProjectSchema,
} from "./projects.schema"

const router = Router()

router.use(authenticateJWT)
router.use(writeRateLimit())

router.post("/", validateBody(createProjectSchema), projectController.createProject)
router.get("/", projectController.getProjects)
router.get("/:id/my-role", projectController.getMyRole)
router.get("/:id", projectController.getProject)
router.put("/:id", validateBody(updateProjectSchema), projectController.updateProject)
router.delete("/:id", projectController.deleteProject)

router.post(
	"/:id/invite",
	validateBody(inviteMemberSchema),
	projectController.inviteToProject
)
router.get("/:projectId/invitations", projectController.getInvitations)
router.delete(
	"/:projectId/invitations/:invitationId",
	projectController.revokeInvitation
)

router.patch(
	"/:projectId/members/:userId/role",
	validateBody(changeMemberRoleSchema),
	projectController.changeMemberRole
)
router.delete(
	"/:projectId/members/:userId",
	projectController.removeMemberFromProject
)

router.post(
	"/:projectId/share-links",
	validateBody(createShareLinkSchema),
	projectController.createShareLink
)
router.get("/:projectId/share-links", projectController.getShareLinks)
router.delete(
	"/:projectId/share-links/:linkId",
	projectController.revokeShareLink
)

router.use("/:projectId/images", projectImagesRouter)
router.use("/:projectId/reviews", projectReviewRouter)

export default router
