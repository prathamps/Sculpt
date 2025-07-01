import { prisma } from "../lib/prisma"
import { Image } from "@prisma/client"
import fs from "fs/promises"
import path from "path"

interface ImagePayload {
	url: string
	name: string
	projectId: string
}

export const addImagesToProject = async (
	images: ImagePayload[]
): Promise<{ count: number }> => {
	return prisma.image.createMany({
		data: images,
		skipDuplicates: true,
	})
}

export const addImageToProject = async (
	projectId: string,
	filePath: string,
	name: string
): Promise<Image> => {
	return prisma.image.create({
		data: {
			url: filePath,
			name,
			projectId,
		},
	})
}

export const getImagesForProject = async (
	projectId: string
): Promise<Image[]> => {
	return prisma.image.findMany({
		where: {
			projectId,
		},
	})
}

export const getImageById = async (id: string): Promise<Image | null> => {
	return prisma.image.findUnique({
		where: {
			id,
		},
	})
}

export const deleteImage = async (id: string): Promise<void> => {
	const image = await prisma.image.findUnique({ where: { id } })
	if (image) {
		await prisma.image.delete({ where: { id } })
		const filePath = path.join(process.cwd(), "..", "..", image.url)
		try {
			await fs.unlink(filePath)
		} catch (error) {
			console.error(`Failed to delete file: ${filePath}`, error)
		}
	}
}

export const updateImage = async (
	id: string,
	data: { name?: string }
): Promise<Image> => {
	return prisma.image.update({
		where: { id },
		data,
	})
}
