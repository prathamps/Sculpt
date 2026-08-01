import { Router } from "express"
import * as commentsController from "./comments.controller"
import {
	projectIdFromCommentParam,
	projectIdFromVersionParam,
	requireProjectRole,
} from "../../middleware/authorize.middleware"
import { validateBody } from "../../middleware/validate.middleware"
import {
	MAX_ATTACHMENTS_PER_COMMENT,
	discardStagedUploadsWhenRequestEnds,
	rejectMismatchedUploads,
	uploadAttachments,
} from "../../middleware/upload.middleware"
import { createCommentSchema, updateCommentSchema } from "./comments.schema"

const router = Router()

const onVersion = (minimum: "VIEWER" | "MEMBER") =>
	requireProjectRole(minimum, projectIdFromVersionParam("imageVersionId"))

const onComment = requireProjectRole("MEMBER", projectIdFromCommentParam())

router.get(
	"/versions/:imageVersionId/comments",
	onVersion("VIEWER"),
	commentsController.listComments
)
router.post(
	"/versions/:imageVersionId/comments",
	onVersion("MEMBER"),
	validateBody(createCommentSchema),
	commentsController.createComment
)
router.post(
	"/comments/:commentId/attachments",
	onComment,
	discardStagedUploadsWhenRequestEnds,
	uploadAttachments.array("files", MAX_ATTACHMENTS_PER_COMMENT),
	rejectMismatchedUploads,
	commentsController.attachToComment
)
router.put(
	"/comments/:commentId",
	onComment,
	validateBody(updateCommentSchema),
	commentsController.updateComment
)
router.delete("/comments/:commentId", onComment, commentsController.deleteComment)
router.post("/comments/:commentId/like", onComment, commentsController.toggleLike)
router.post(
	"/comments/:commentId/resolve",
	onComment,
	commentsController.toggleResolved
)

export default router
