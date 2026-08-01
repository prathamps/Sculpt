import { Router } from "express"
import * as reviewsController from "./reviews.controller"
import {
	projectIdFromParam,
	projectIdFromVersionParam,
	requireProjectRole,
} from "../../middleware/authorize.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import { recordDecisionSchema, setDueDateSchema } from "./reviews.schema"

const versionReviewRouter = Router()

const onVersion = (minimum: "VIEWER" | "MEMBER" | "EDITOR") =>
	requireProjectRole(minimum, projectIdFromVersionParam("versionId"))

versionReviewRouter.get(
	"/versions/:versionId/reviews",
	onVersion("VIEWER"),
	reviewsController.listDecisions
)
versionReviewRouter.post(
	"/versions/:versionId/reviews",
	onVersion("MEMBER"),
	validateBody(recordDecisionSchema),
	reviewsController.recordDecision
)
versionReviewRouter.delete(
	"/versions/:versionId/reviews",
	onVersion("MEMBER"),
	reviewsController.withdrawDecision
)
versionReviewRouter.patch(
	"/versions/:versionId/due-date",
	onVersion("EDITOR"),
	validateBody(setDueDateSchema),
	reviewsController.setDueDate
)

const projectReviewRouter = Router({ mergeParams: true })

projectReviewRouter.get(
	"/summary",
	requireProjectRole("VIEWER", projectIdFromParam("projectId")),
	reviewsController.projectSummary
)

export { versionReviewRouter, projectReviewRouter }
