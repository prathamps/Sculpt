import { AuthenticatedUser } from "../types"
import { Request, Response } from "express"
import * as imageService from "../services/images.service"
import { detectMediaType } from "../middleware/upload.middleware"
import {
	assertCanUploadVideo,
	assertCanAddVersion,
} from "../services/subscription.service"
import { PlanLimitError } from "../lib/plans"

// Translate a PlanLimitError into HTTP 402 (Payment Required) with an upgrade
// hint, or return false if the error is something else.
const handlePlanLimit = (error: unknown, res: Response): boolean => {
	if (error instanceof PlanLimitError) {
		res.status(402).json({
			message: error.message,
			code: error.code,
			limit: error.limit,
		})
		return true
	}
	return false
}

export const uploadImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		const files = req.files as Express.Multer.File[]
		const userId = (req.user as AuthenticatedUser)?.id

		if (!files || files.length === 0) {
			res.status(400).send("No files uploaded.")
			return
		}

		// Video upload is a PRO feature — gate before persisting anything.
		const hasVideo = files.some(
			(file) => detectMediaType(file.mimetype) === "VIDEO"
		)
		if (hasVideo && userId) {
			await assertCanUploadVideo(userId)
		}

		// Each file will create a new image with a first version
		const imagePayloads = files.map((file) => ({
			url: `uploads/${file.filename}`,
			name: file.originalname,
			projectId,
			mediaType: detectMediaType(file.mimetype),
			duration: req.body.duration ? Number(req.body.duration) : null,
		}))

		const images = await imageService.addImagesToProject(imagePayloads)

		// We need to fetch the created images with their versions to return to the client
		if (images.count > 0) {
			const newImages = await imageService.getImagesForProject(projectId)
			res.status(201).json(newImages)
		} else {
			res.status(201).json({ count: 0 })
		}
	} catch (error) {
		if (handlePlanLimit(error, res)) return
		res.status(500).json({ message: "Error uploading image", error })
	}
}

export const getProjectImages = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		const images = await imageService.getImagesForProject(projectId)
		res.status(200).json(images)
	} catch (error) {
		res.status(500).json({ message: "Error fetching images", error })
	}
}

export const getImage = async (req: Request, res: Response): Promise<void> => {
	try {
		const { id } = req.params
		const image = await imageService.getImageById(id)
		if (!image) {
			res.status(404).json({ message: "Image not found" })
			return
		}

		// Add latestVersion to make it consistent with other endpoints
		const latestVersion =
			image.versions && image.versions.length > 0 ? image.versions[0] : null

		const enrichedImage = {
			...image,
			latestVersion,
		}

		res.status(200).json(enrichedImage)
	} catch (error) {
		res.status(500).json({ message: "Error fetching image", error })
	}
}

export const getImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { versionId } = req.params
		const version = await imageService.getImageVersionById(versionId)
		if (!version) {
			res.status(404).json({ message: "Image version not found" })
			return
		}
		res.status(200).json(version)
	} catch (error) {
		res.status(500).json({ message: "Error fetching image version", error })
	}
}

export const uploadImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageId } = req.params
		const file = req.file as Express.Multer.File
		const userId = (req.user as AuthenticatedUser)?.id

		if (!file) {
			res.status(400).send("No file uploaded.")
			return
		}

		const mediaType = detectMediaType(file.mimetype)

		if (userId) {
			// Enforce plan version cap (FREE = 2, PRO = unlimited).
			const currentCount = await imageService.getVersionCount(imageId)
			await assertCanAddVersion(userId, currentCount)
			// Video versions are a PRO feature.
			if (mediaType === "VIDEO") {
				await assertCanUploadVideo(userId)
			}
		}

		// Create the new version
		const newVersion = await imageService.addImageVersion(
			imageId,
			`uploads/${file.filename}`,
			req.body.versionName,
			mediaType,
			req.body.duration ? Number(req.body.duration) : null
		)
		console.log("[uploadImageVersion] New version created:", newVersion)
		// Get the full image with all versions to return to the client
		const image = await imageService.getImageById(imageId)
		console.log("[uploadImageVersion] Image after adding version:", image)
		if (!image) {
			res.status(404).json({ message: "Image not found" })
			return
		}

		// Add latestVersion
		const latestVersion =
			image.versions && image.versions.length > 0 ? image.versions[0] : null

		const enrichedImage = {
			...image,
			latestVersion,
		}

		// Return the full image object with versions and latestVersion
		res.status(201).json(enrichedImage)
	} catch (error) {
		if (handlePlanLimit(error, res)) return
		res.status(500).json({ message: "Error uploading image version", error })
	}
}

export const deleteImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		await imageService.deleteImage(id)
		res.status(204).send()
	} catch (error) {
		res.status(500).json({ message: "Error deleting image", error })
	}
}

export const deleteImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { versionId } = req.params
		await imageService.deleteImageVersion(versionId)
		res.status(204).send()
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "Cannot delete the only version of an image"
		) {
			res.status(400).json({ message: error.message })
		} else {
			res.status(500).json({ message: "Error deleting image version", error })
		}
	}
}

export const updateImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const { name } = req.body
		const updatedImage = await imageService.updateImage(id, { name })
		res.status(200).json(updatedImage)
	} catch (error) {
		res.status(500).json({ message: "Error updating image", error })
	}
}

export const updateImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { versionId } = req.params
		const { versionName } = req.body
		const updatedVersion = await imageService.updateImageVersion(versionId, {
			versionName,
		})
		res.status(200).json(updatedVersion)
	} catch (error) {
		res.status(500).json({ message: "Error updating image version", error })
	}
}

// Comment endpoints
export const addComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageVersionId } = req.params
		const { content, parentId, annotation, timestamp } = req.body
		const userId = (req.user as AuthenticatedUser)?.id

		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		const comment = await imageService.addComment(
			content,
			imageVersionId,
			userId,
			parentId,
			annotation,
			typeof timestamp === "number" ? timestamp : null
		)
		res.status(201).json(comment)
	} catch (error) {
		res.status(500).json({ message: "Error adding comment", error })
	}
}

export const getComments = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageVersionId } = req.params
		const comments = await imageService.getCommentsForImageVersion(
			imageVersionId
		)
		res.status(200).json(comments)
	} catch (error) {
		res.status(500).json({ message: "Error fetching comments", error })
	}
}

export const deleteComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { commentId } = req.params
		const userId = (req.user as AuthenticatedUser)?.id

		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		// Check if the user owns the comment
		const comment = await imageService.getCommentById(commentId)

		if (!comment) {
			res.status(404).json({ message: "Comment not found" })
			return
		}

		if (comment.userId !== userId) {
			res.status(403).json({ message: "Unauthorized to delete this comment" })
			return
		}

		await imageService.deleteComment(commentId)
		res.status(204).send()
	} catch (error) {
		res.status(500).json({ message: "Error deleting comment", error })
	}
}

export const toggleLikeComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { commentId } = req.params
		const userId = (req.user as AuthenticatedUser)?.id

		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		const result = await imageService.toggleLikeComment(commentId, userId)
		res.status(200).json(result)
	} catch (error) {
		res.status(500).json({ message: "Error toggling comment like", error })
	}
}

export const toggleResolveComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { commentId } = req.params
		const userId = (req.user as AuthenticatedUser)?.id

		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		// Check if the user has permission to toggle resolved status
		const comment = await imageService.getCommentById(commentId)

		if (!comment) {
			res.status(404).json({ message: "Comment not found" })
			return
		}

		// For now, only the comment author can toggle resolved status
		// In a real app, you might want to check project permissions too
		if (comment.userId !== userId) {
			res.status(403).json({ message: "Unauthorized to resolve this comment" })
			return
		}

		const result = await imageService.toggleCommentResolved(commentId)
		res.status(200).json(result)
	} catch (error) {
		res
			.status(500)
			.json({ message: "Error toggling comment resolved status", error })
	}
}
