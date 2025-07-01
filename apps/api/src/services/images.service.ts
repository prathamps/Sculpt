import { prisma } from "../lib/prisma"
import { Image, ImageVersion } from "@prisma/client"
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
	// Create images with their first version
	const createdImages = await Promise.all(
		images.map(async (img) => {
			return prisma.image.create({
				data: {
					name: img.name,
					projectId: img.projectId,
					versions: {
						create: {
							url: img.url,
							versionName: "Version 1",
							versionNumber: 1,
						},
					},
				},
				include: {
					versions: true,
				},
			})
		})
	)

	return { count: createdImages.length }
}

export const addImageToProject = async (
	projectId: string,
	filePath: string,
	name: string
): Promise<Image> => {
	return prisma.image.create({
		data: {
			name,
			projectId,
			versions: {
				create: {
					url: filePath,
					versionName: "Version 1",
					versionNumber: 1,
				},
			},
		},
	})
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

	// Transform the result to make it easier to work with
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
	filePath: string,
	versionName?: string
): Promise<ImageVersion> => {
	// Get the current versions
	const currentVersions = await prisma.imageVersion.findMany({
		where: { imageId },
		orderBy: { versionNumber: "desc" },
	})

	// Check if we've hit the maximum number of allowed versions (2)
	if (currentVersions.length >= 2) {
		throw new Error("Maximum number of versions (2) reached for this image")
	}

	const nextVersionNumber =
		currentVersions.length > 0 ? currentVersions[0].versionNumber + 1 : 1

	// Create the new version
	return prisma.imageVersion.create({
		data: {
			url: filePath,
			versionName: versionName || `Version ${nextVersionNumber}`,
			versionNumber: nextVersionNumber,
			imageId,
		},
	})
}

export const deleteImage = async (id: string): Promise<void> => {
	const image = await prisma.image.findUnique({
		where: { id },
		include: { versions: true },
	})

	if (image) {
		// Delete the image record (cascades to versions)
		await prisma.image.delete({ where: { id } })

		// Delete all version files
		for (const version of image.versions) {
			const filePath = path.join(process.cwd(), "..", "..", version.url)
			try {
				await fs.unlink(filePath)
			} catch (error) {
				console.error(`Failed to delete file: ${filePath}`, error)
			}
		}
	}
}

export const deleteImageVersion = async (versionId: string): Promise<void> => {
	const version = await prisma.imageVersion.findUnique({
		where: { id: versionId },
	})

	if (version) {
		// Don't allow deleting the only version of an image
		const versionCount = await prisma.imageVersion.count({
			where: { imageId: version.imageId },
		})

		if (versionCount <= 1) {
			throw new Error("Cannot delete the only version of an image")
		}

		await prisma.imageVersion.delete({ where: { id: versionId } })

		// Delete the file
		const filePath = path.join(process.cwd(), "..", "..", version.url)
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

export const updateImageVersion = async (
	versionId: string,
	data: { versionName?: string }
): Promise<ImageVersion> => {
	return prisma.imageVersion.update({
		where: { id: versionId },
		data,
	})
}

// Comment-related functions
export const addComment = async (
	content: string,
	imageVersionId: string,
	userId: string,
	parentId?: string
): Promise<any> => {
	return prisma.comment.create({
		data: {
			content,
			imageVersionId,
			userId,
			parentId,
		},
		include: {
			user: true,
			replies: {
				include: {
					user: true,
				},
			},
		},
	})
}

export const getCommentsForImageVersion = async (
	imageVersionId: string
): Promise<any[]> => {
	return prisma.comment.findMany({
		where: {
			imageVersionId,
			parentId: null, // Only get top-level comments
		},
		include: {
			user: true,
			replies: {
				include: {
					user: true,
				},
			},
		},
		orderBy: {
			createdAt: "desc",
		},
	})
}
