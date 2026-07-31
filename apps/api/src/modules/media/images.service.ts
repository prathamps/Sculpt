import { Image, ImageVersion, MediaType, Prisma, ProxyStatus } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import { ValidationError } from "../../lib/errors"
import { forgetProjectAssets, recordProjectAssets } from "./media-access.service"

const VERSION_NUMBER_CONFLICT = "P2002"
const MAX_VERSION_NUMBER_ATTEMPTS = 5

interface ImagePayload {
	url: string
	name: string
	projectId: string
	folderId?: string | null
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

const assetUrlsOf = (
	version: Pick<ImageVersion, "url" | "thumbnailUrl" | "proxyUrl">
): string[] =>
	[version.url, version.thumbnailUrl, version.proxyUrl].filter(
		(url): url is string => !!url
	)

export const addImagesToProject = async (
	images: ImagePayload[]
): Promise<(Image & { versions: ImageVersion[] })[]> => {
	if (images.length === 0) return []

	const created = await prisma.$transaction((tx) =>
		Promise.all(
			images.map((image) =>
				tx.image.create({
					data: {
						name: image.name,
						projectId: image.projectId,
						folderId: image.folderId ?? null,
						versions: {
							create: {
								url: image.url,
								versionName: "Version 1",
								versionNumber: 1,
								mediaType: image.mediaType ?? MediaType.IMAGE,
								duration: image.duration ?? null,
								thumbnailUrl: image.thumbnailUrl ?? null,
								proxyUrl: image.proxyUrl ?? null,
								proxyStatus: image.proxyStatus ?? null,
							},
						},
					},
					include: { versions: true },
				})
			)
		)
	)

	await recordProjectAssets(
		created.flatMap((image) => image.versions.flatMap(assetUrlsOf)),
		images[0].projectId
	)

	return created
}

export const getImagesForProject = async (
	projectId: string,
	folderId?: string | null
): Promise<(Image & { latestVersion: ImageVersion | null })[]> => {
	const images = await prisma.image.findMany({
		where: {
			projectId,
			...(folderId === undefined ? {} : { folderId }),
		},
		include: {
			versions: { orderBy: { versionNumber: "desc" }, take: 1 },
		},
		orderBy: { updatedAt: "desc" },
	})

	return images.map((image) => ({
		...image,
		latestVersion: image.versions[0] || null,
	}))
}

export const getImageById = async (
	id: string
): Promise<(Image & { versions: ImageVersion[] }) | null> =>
	prisma.image.findUnique({
		where: { id },
		include: { versions: { orderBy: { versionNumber: "desc" } } },
	})

export const getImageVersionById = async (
	versionId: string
): Promise<ImageVersion | null> =>
	prisma.imageVersion.findUnique({ where: { id: versionId } })

export const getVersionForDownload = async (versionId: string) =>
	prisma.imageVersion.findUnique({
		where: { id: versionId },
		select: {
			url: true,
			versionNumber: true,
			image: { select: { name: true } },
		},
	})

const isVersionNumberConflict = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === VERSION_NUMBER_CONFLICT

export const addImageVersion = async (
	imageId: string,
	fileUrl: string,
	options: VersionOptions = {}
): Promise<ImageVersion> => {
	for (let attempt = 0; attempt < MAX_VERSION_NUMBER_ATTEMPTS; attempt++) {
		const latest = await prisma.imageVersion.findFirst({
			where: { imageId },
			orderBy: { versionNumber: "desc" },
			select: { versionNumber: true },
		})
		const nextVersionNumber = (latest?.versionNumber ?? 0) + 1

		try {
			const version = await prisma.imageVersion.create({
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
				include: { image: { select: { projectId: true } } },
			})

			await recordProjectAssets(assetUrlsOf(version), version.image.projectId)

			return version
		} catch (error) {
			if (!isVersionNumberConflict(error)) throw error
		}
	}

	throw new ValidationError(
		"Another version was uploaded at the same time. Try again."
	)
}

export const deleteImage = async (id: string): Promise<void> => {
	const image = await prisma.image.findUnique({
		where: { id },
		include: { versions: true },
	})

	if (!image) return

	const urls = image.versions.flatMap(assetUrlsOf)

	await prisma.image.delete({ where: { id } })
	await forgetProjectAssets(urls)
	await Promise.all(urls.map((url) => storage.remove(url)))
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
		throw new ValidationError("Cannot delete the only version of an image")
	}

	const urls = assetUrlsOf(version)

	await prisma.imageVersion.delete({ where: { id: versionId } })
	await forgetProjectAssets(urls)
	await Promise.all(urls.map((url) => storage.remove(url)))
}

export const updateImage = async (
	id: string,
	data: { name?: string }
): Promise<Image> => prisma.image.update({ where: { id }, data })

export const updateImageVersion = async (
	versionId: string,
	data: { versionName?: string }
): Promise<ImageVersion> =>
	prisma.imageVersion.update({ where: { id: versionId }, data })
