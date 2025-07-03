import { Request, Response } from "express"
import { CommentsService } from "../services/comments.service"

export class CommentsController {
	// Get comments for an image version
	static async getCommentsByImageVersion(req: Request, res: Response) {
		try {
			const { imageVersionId } = req.params
			const userId = req.user?.id

			const comments = await CommentsService.getCommentsByImageVersionId(
				imageVersionId,
				userId
			)
			return res.status(200).json(comments)
		} catch (error) {
			console.error("Error fetching comments:", error)
			return res.status(500).json({ message: "Internal server error" })
		}
	}

	// Create a new comment
	static async createComment(req: Request, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: "Unauthorized" })
			}

			const { imageVersionId } = req.params
			const { content, parentId, annotation } = req.body

			if (!content) {
				return res.status(400).json({ message: "Content is required" })
			}

			const comment = await CommentsService.createComment({
				content,
				imageVersionId,
				userId,
				parentId: parentId || null,
				annotation: annotation || null,
			})

			return res.status(201).json(comment)
		} catch (error) {
			console.error("Error creating comment:", error)
			return res.status(500).json({ message: "Internal server error" })
		}
	}

	// Update a comment
	static async updateComment(req: Request, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: "Unauthorized" })
			}

			const { commentId } = req.params
			const { content, resolved } = req.body

			if (!content) {
				return res.status(400).json({ message: "Content is required" })
			}

			const comment = await CommentsService.updateComment(
				commentId,
				{ content, resolved },
				userId
			)

			return res.status(200).json(comment)
		} catch (error) {
			console.error("Error updating comment:", error)
			if (error.message?.includes("permission")) {
				return res.status(403).json({ message: error.message })
			}
			return res.status(500).json({ message: "Internal server error" })
		}
	}

	// Delete a comment
	static async deleteComment(req: Request, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: "Unauthorized" })
			}

			const { commentId } = req.params

			await CommentsService.deleteComment(commentId, userId)

			return res.status(200).json({ message: "Comment deleted successfully" })
		} catch (error) {
			console.error("Error deleting comment:", error)
			if (error.message?.includes("permission")) {
				return res.status(403).json({ message: error.message })
			}
			return res.status(500).json({ message: "Internal server error" })
		}
	}

	// Like or unlike a comment
	static async toggleLike(req: Request, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: "Unauthorized" })
			}

			const { commentId } = req.params

			const result = await CommentsService.toggleLike(commentId, userId)

			return res.status(200).json(result)
		} catch (error) {
			console.error("Error toggling comment like:", error)
			return res.status(500).json({ message: "Internal server error" })
		}
	}
}
