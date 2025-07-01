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

		const imagePayloads = files.map((file) => ({
			url: `uploads/${file.filename}`,
			name: file.originalname,
			projectId,
		}))

		const images = await imageService.addImagesToProject(imagePayloads)
		res.status(201).json(images)
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
		res.status(200).json(image)
	} catch (error) {
		res.status(500).json({ message: "Error fetching image", error })
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
