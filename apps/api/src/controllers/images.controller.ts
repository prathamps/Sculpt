import { Request, Response } from "express"
import * as imageService from "../services/images.service"

export const uploadImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		const files = req.files as Express.Multer.File[]

		if (!files || files.length === 0) {
			res.status(400).send("No files uploaded.")
			return
		}

		// Each file will create a new image with a first version
		const imagePayloads = files.map((file) => ({
			url: `uploads/${file.filename}`,
			name: file.originalname,
			projectId,
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
		const { versionName } = req.body
		const file = req.file as Express.Multer.File

		if (!file) {
			res.status(400).send("No file uploaded.")
			return
		}

		const filePath = `uploads/${file.filename}`
		// Create the new version
		const version = await imageService.addImageVersion(
			imageId,
			filePath,
			versionName
		)

		// Get the full image with all versions to return to the client
		const image = await imageService.getImageById(imageId)
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
		if (
			error instanceof Error &&
			error.message === "Maximum number of versions (2) reached for this image"
		) {
			res.status(400).json({ message: error.message })
		} else {
			res.status(500).json({ message: "Error uploading image version", error })
		}
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
		const { content, parentId, annotation } = req.body
		const userId = (req.user as any)?.id

		if (!userId) {
			res.status(401).json({ message: "Unauthorized" })
			return
		}

		const comment = await imageService.addComment(
			content,
			imageVersionId,
			userId,
			parentId,
			annotation
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
		const userId = (req.user as any)?.id

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
		const userId = (req.user as any)?.id

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
