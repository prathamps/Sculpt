import { prisma } from "../../lib/prisma"
import { Image, ImageVersion, MediaType } from "@prisma/client"
import { storage } from "../../storage"

interface ImagePayload {
	url: string
	name: string
	projectId: string
	mediaType?: MediaType
	duration?: number | null
}

export const addImagesToProject = async (
	images: ImagePayload[]
): Promise<{ count: number }> => {
	const createdImages = await Promise.all(
		images.map((img) =>
			prisma.image.create({
				data: {
					name: img.name,
					projectId: img.projectId,
					versions: {
						create: {
							url: img.url,
							versionName: "Version 1",
							versionNumber: 1,
							mediaType: img.mediaType ?? MediaType.IMAGE,
							duration: img.duration ?? null,
						},
					},
				},
			})
		)
	)

	return { count: createdImages.length }
}

export const getImagesForProject = async (
	projectId: string
): Promise<(Image & { latestVersion: ImageVersion | null })[]> => {
	const images = await prisma.image.findMany({
		where: {
			projectId,
		},
		include: {
			versions: {
				orderBy: {
					versionNumber: "desc",
				},
				take: 1,
			},
		},
	})

	return images.map((image) => ({
		...image,
		latestVersion: image.versions[0] || null,
	}))
}

export const getImageById = async (
	id: string
): Promise<(Image & { versions: ImageVersion[] }) | null> => {
	return prisma.image.findUnique({
		where: {
			id,
		},
		include: {
			versions: {
				orderBy: {
					versionNumber: "desc",
				},
			},
		},
	})
}

export const getImageVersionById = async (
	versionId: string
): Promise<ImageVersion | null> => {
	return prisma.imageVersion.findUnique({
		where: {
			id: versionId,
		},
	})
}

export const addImageVersion = async (
	imageId: string,
	fileUrl: string,
	versionName?: string,
	mediaType: MediaType = MediaType.IMAGE,
	duration?: number | null
): Promise<ImageVersion> => {
	const latest = await prisma.imageVersion.findFirst({
		where: { imageId },
		orderBy: { versionNumber: "desc" },
	})

	const nextVersionNumber = latest ? latest.versionNumber + 1 : 1

	return prisma.imageVersion.create({
		data: {
			url: fileUrl,
			versionName: versionName || `Version ${nextVersionNumber}`,
			versionNumber: nextVersionNumber,
			imageId,
			mediaType,
			duration: duration ?? null,
		},
	})
}

export const deleteImage = async (id: string): Promise<void> => {
	const image = await prisma.image.findUnique({
		where: { id },
		include: { versions: true },
	})

	if (!image) return

	await prisma.image.delete({ where: { id } })

	await Promise.all(image.versions.map((version) => storage.remove(version.url)))
}

export const deleteImageVersion = async (versionId: string): Promise<void> => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: versionId },
	})

	if (!version) return

	const versionCount = await prisma.imageVersion.count({
		where: { imageId: version.imageId },
	})

	if (versionCount <= 1) {
		throw new Error("Cannot delete the only version of an image")
	}

	await prisma.imageVersion.delete({ where: { id: versionId } })
	await storage.remove(version.url)
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

export const updateImageVersion = async (
	versionId: string,
	data: { versionName?: string }
): Promise<ImageVersion> => {
	return prisma.imageVersion.update({
		where: { id: versionId },
		data,
	})
}
