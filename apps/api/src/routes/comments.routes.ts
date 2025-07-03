import express from "express"
import { CommentsController } from "../controllers/comments.controller"
import { authenticateJWT } from "../middleware/auth.middleware"

const router = express.Router()

// All routes require authentication
router.use(authenticateJWT)

// Get all comments for an image version
router.get(
	"/image-versions/:imageVersionId/comments",
	CommentsController.getCommentsByImageVersion
)

// Create a new comment on an image version
router.post(
	"/image-versions/:imageVersionId/comments",
	CommentsController.createComment
)

// Update a comment
router.put("/comments/:commentId", CommentsController.updateComment)

// Delete a comment
router.delete("/comments/:commentId", CommentsController.deleteComment)

// Like or unlike a comment
router.post("/comments/:commentId/like", CommentsController.toggleLike)

export default router
