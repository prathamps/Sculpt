import { prisma } from "../../lib/prisma"
import { Image, ImageVersion, MediaType, ProxyStatus } from "@prisma/client"
import { storage } from "../../storage"

interface ImagePayload {
	url: string
	name: string
	projectId: string
	mediaType?: MediaType
	duration?: number | null
	thumbnailUrl?: string | null
	proxyUrl?: string | null
	proxyStatus?: ProxyStatus | null
}

interface VersionOptions {
	versionName?: string
	mediaType?: MediaType
	duration?: number | null
	thumbnailUrl?: string | null
	proxyUrl?: string | null
	proxyStatus?: ProxyStatus | null
}

export const addImagesToProject = async (
	images: ImagePayload[]
): Promise<(Image & { versions: ImageVersion[] })[]> => {
	return Promise.all(
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
							thumbnailUrl: img.thumbnailUrl ?? null,
							proxyUrl: img.proxyUrl ?? null,
							proxyStatus: img.proxyStatus ?? null,
						},
					},
				},
				include: { versions: true },
			})
		)
	)
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
	options: VersionOptions = {}
): Promise<ImageVersion> => {
	const latest = await prisma.imageVersion.findFirst({
		where: { imageId },
		orderBy: { versionNumber: "desc" },
	})

	const nextVersionNumber = latest ? latest.versionNumber + 1 : 1

	return prisma.imageVersion.create({
		data: {
			url: fileUrl,
			versionName: options.versionName || `Version ${nextVersionNumber}`,
			versionNumber: nextVersionNumber,
			imageId,
			mediaType: options.mediaType ?? MediaType.IMAGE,
			duration: options.duration ?? null,
			thumbnailUrl: options.thumbnailUrl ?? null,
			proxyUrl: options.proxyUrl ?? null,
			proxyStatus: options.proxyStatus ?? null,
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

	await Promise.all(image.versions.flatMap(storedVersionFileRemovals))
}

const storedVersionFileRemovals = (
	version: Pick<ImageVersion, "url" | "thumbnailUrl" | "proxyUrl">
): Promise<void>[] =>
	[version.url, version.thumbnailUrl, version.proxyUrl]
		.filter((url): url is string => !!url)
		.map((url) => storage.remove(url))

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
	await Promise.all(storedVersionFileRemovals(version))
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
