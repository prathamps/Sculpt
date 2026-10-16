import { Router } from "express"
import * as projectController from "./projects.controller"
import { authenticateJWT } from "../../middleware/auth.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import { writeRateLimit } from "../../middleware/rate-limit.middleware"
import {
	projectIdFromParam,
	requireProjectRole,
} from "../../middleware/authorize.middleware"
import { projectImagesRouter } from "../media/images.routes"
import { projectReviewRouter } from "../reviews/reviews.routes"
import {
	projectFoldersRouter,
	projectImageFolderRouter,
} from "../folders/folders.routes"
import {
	changeMemberRoleSchema,
	createProjectSchema,
	createShareLinkSchema,
	inviteMemberSchema,
	updateProjectSchema,
} from "./projects.schema"

const router = Router()

const onProject = (minimum: "VIEWER" | "OWNER") =>
	requireProjectRole(minimum, projectIdFromParam("id"))

const onProjectScope = (minimum: "VIEWER" | "OWNER") =>
	requireProjectRole(minimum, projectIdFromParam("projectId"))

router.use(authenticateJWT)
router.use(writeRateLimit())

router.post("/", validateBody(createProjectSchema), projectController.createProject)
router.get("/", projectController.getProjects)
router.get("/:id/my-role", onProject("VIEWER"), projectController.getMyRole)
router.get("/:id", onProject("VIEWER"), projectController.getProject)
router.put(
	"/:id",
	onProject("OWNER"),
	validateBody(updateProjectSchema),
	projectController.updateProject
)
router.delete("/:id", onProject("OWNER"), projectController.deleteProject)

router.post(
	"/:id/invite",
	onProject("OWNER"),
	validateBody(inviteMemberSchema),
	projectController.inviteToProject
)
router.get(
	"/:projectId/invitations",
	onProjectScope("OWNER"),
	projectController.getInvitations
)
router.delete(
	"/:projectId/invitations/:invitationId",
	onProjectScope("OWNER"),
	projectController.revokeInvitation
)

router.get(
	"/:projectId/members",
	onProjectScope("VIEWER"),
	projectController.getMembers
)
router.post(
	"/:projectId/members/leave",
	onProjectScope("VIEWER"),
	projectController.leaveProject
)
router.patch(
	"/:projectId/members/:userId/role",
	onProjectScope("OWNER"),
	validateBody(changeMemberRoleSchema),
	projectController.changeMemberRole
)
router.delete(
	"/:projectId/members/:userId",
	onProjectScope("OWNER"),
	projectController.removeMemberFromProject
)

router.post(
	"/:projectId/share-links",
	onProjectScope("OWNER"),
	validateBody(createShareLinkSchema),
	projectController.createShareLink
)
router.get(
	"/:projectId/share-links",
	onProjectScope("OWNER"),
	projectController.getShareLinks
)
router.delete(
	"/:projectId/share-links/:linkId",
	onProjectScope("OWNER"),
	projectController.revokeShareLink
)

router.use("/:projectId/folders", projectFoldersRouter)
router.use("/:projectId/images", projectImageFolderRouter)
router.use("/:projectId/images", projectImagesRouter)
router.use("/:projectId/reviews", projectReviewRouter)

export default router
