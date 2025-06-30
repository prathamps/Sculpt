import { prisma } from "../lib/prisma"
import { Image } from "@prisma/client"

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
