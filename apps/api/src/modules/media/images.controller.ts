import { Request, Response } from "express"
import * as imageService from "./images.service"
import {
	detectMediaType,
	needsBrowserSafeImageRendition,
} from "../../middleware/upload.middleware"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { parseFilesMeta } from "./upload-meta"
import {
	discardStagedVideo,
	enqueueVideoProxy,
	stageVideoForProcessing,
} from "./video-pipeline"
import { enqueueImageRendition } from "./image-pipeline"
import path from "path"
import { storage, uploadsDir } from "../../storage"
import { storedPathOf } from "./media-access.service"
import { downloadFileName } from "./download-name"
import { NotFoundError, ValidationError } from "../../lib/errors"
import { respondWithError } from "../../lib/http"
import { recordAudit, requestIp } from "../audit/audit.service"
import { ProxyStatus } from "@prisma/client"

const withLatestVersion = (
	image: NonNullable<Awaited<ReturnType<typeof imageService.getImageById>>>
) => ({
	...image,
	latestVersion: image.versions[0] ?? null,
})

const folderScopeOf = (req: Request): string | null | undefined => {
	const folder = req.query.folderId
	if (folder === undefined) return undefined
	if (folder === "" || folder === "root") return null
	return typeof folder === "string" ? folder : undefined
}

const uploadFolderOf = (req: Request): string | null => {
	const folder = req.body?.folderId
	return typeof folder === "string" && folder ? folder : null
}

type UploadFields = Record<string, Express.Multer.File[] | undefined>

interface StoredMediaFiles {
	url: string
	thumbnailUrl: string | null
	modelProxyUrl: string | null
}

const storeUploadedFile = async (
	file: Express.Multer.File
): Promise<string> =>
	storage.store({
		path: file.path,
		originalName: file.originalname,
		mimeType: file.mimetype,
	})

const proxyStatusFor = (
	transcodeSource: string | null,
	modelProxyUrl: string | null
): ProxyStatus | null =>
	transcodeSource
		? ProxyStatus.PENDING
		: modelProxyUrl
			? ProxyStatus.READY
			: null

const scheduleRendition = (
	versionId: string,
	sourcePath: string,
	mediaType: string,
	hasPoster: boolean
): void => {
	if (mediaType === "VIDEO") {
		enqueueVideoProxy({ versionId, sourcePath, needsPoster: !hasPoster })
		return
	}
	enqueueImageRendition({ versionId, sourcePath })
}

export const uploadImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	const { userId, projectId } = authorizedScope(res)
	const fields = (req.files ?? {}) as UploadFields
	const files = fields.images ?? []
	const thumbnails = fields.thumbnails ?? []
	const modelProxies = fields.modelProxies ?? []

	const storedUrls: string[] = []
	const stagedSources: (string | null)[] = []

	try {
		if (files.length === 0) {
			throw new ValidationError("No files uploaded.")
		}

		const metas = parseFilesMeta(
			req.body.filesMeta,
			files.length,
			{ thumbnails: thumbnails.length, modelProxies: modelProxies.length },
			req.body.duration ? Number(req.body.duration) : null
		)

		const imagePayloads = []
		let thumbnailIndex = 0
		let modelProxyIndex = 0

		for (const [index, file] of files.entries()) {
			const mediaType = detectMediaType(file.mimetype)
			const needsRendition =
				mediaType === "VIDEO" || needsBrowserSafeImageRendition(file.mimetype)
			const transcodeSource = needsRendition
				? await stageVideoForProcessing(file.path)
				: null
			stagedSources.push(transcodeSource)

			const stored: StoredMediaFiles = {
				url: await storeUploadedFile(file),
				thumbnailUrl: null,
				modelProxyUrl: null,
			}
			storedUrls.push(stored.url)

			if (metas[index].hasThumbnail) {
				stored.thumbnailUrl = await storeUploadedFile(
					thumbnails[thumbnailIndex++]
				)
				storedUrls.push(stored.thumbnailUrl)
			}

			if (metas[index].hasModelProxy) {
				stored.modelProxyUrl = await storeUploadedFile(
					modelProxies[modelProxyIndex++]
				)
				storedUrls.push(stored.modelProxyUrl)
			}

			imagePayloads.push({
				url: stored.url,
				name: file.originalname,
				projectId,
				folderId: uploadFolderOf(req),
				mediaType,
				duration: metas[index].duration,
				thumbnailUrl: stored.thumbnailUrl,
				proxyUrl: stored.modelProxyUrl,
				proxyStatus: proxyStatusFor(transcodeSource, stored.modelProxyUrl),
			})
		}

		const created = await imageService.addImagesToProject(imagePayloads)

		created.forEach((image, index) => {
			const sourcePath = stagedSources[index]
			const firstVersion = image.versions[0]
			if (!sourcePath || !firstVersion) return
			scheduleRendition(
				firstVersion.id,
				sourcePath,
				imagePayloads[index].mediaType,
				!!imagePayloads[index].thumbnailUrl
			)
			stagedSources[index] = null
		})

		await recordAudit({
			action: "media.uploaded",
			targetType: "project",
			targetId: projectId,
			actorId: userId,
			metadata: { files: imagePayloads.map((payload) => payload.name) },
			ipAddress: requestIp(req),
		})

		res
			.status(201)
			.json(
				await imageService.getImagesForProject(projectId, uploadFolderOf(req))
			)
	} catch (error) {
		await Promise.all(storedUrls.map((url) => storage.remove(url)))
		await Promise.all(
			stagedSources
				.filter((source): source is string => !!source)
				.map(discardStagedVideo)
		)
		respondWithError(res, error, "upload media")
	}
}

export const uploadImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	const { userId } = authorizedScope(res)
	const { imageId } = req.params
	const fields = (req.files ?? {}) as UploadFields
	const file = fields.image?.[0]
	const thumbnail = fields.thumbnail?.[0]
	const modelProxy = fields.modelProxy?.[0]

	const storedUrls: string[] = []
	let transcodeSource: string | null = null

	try {
		if (!file) {
			throw new ValidationError("No file uploaded.")
		}

		const mediaType = detectMediaType(file.mimetype)
		const needsRendition =
			mediaType === "VIDEO" || needsBrowserSafeImageRendition(file.mimetype)
		transcodeSource = needsRendition
			? await stageVideoForProcessing(file.path)
			: null

		const url = await storeUploadedFile(file)
		storedUrls.push(url)

		let thumbnailUrl: string | null = null
		if (thumbnail) {
			thumbnailUrl = await storeUploadedFile(thumbnail)
			storedUrls.push(thumbnailUrl)
		}

		let modelProxyUrl: string | null = null
		if (modelProxy) {
			modelProxyUrl = await storeUploadedFile(modelProxy)
			storedUrls.push(modelProxyUrl)
		}

		const version = await imageService.addImageVersion(imageId, url, {
			versionName: req.body.versionName,
			mediaType,
			duration: req.body.duration ? Number(req.body.duration) : null,
			thumbnailUrl,
			proxyUrl: modelProxyUrl,
			proxyStatus: proxyStatusFor(transcodeSource, modelProxyUrl),
		})

		if (transcodeSource) {
			scheduleRendition(version.id, transcodeSource, mediaType, !!thumbnailUrl)
			transcodeSource = null
		}

		await recordAudit({
			action: "media.version_uploaded",
			targetType: "image",
			targetId: imageId,
			actorId: userId,
			metadata: { versionName: req.body.versionName ?? null },
			ipAddress: requestIp(req),
		})

		const image = await imageService.getImageById(imageId)
		if (!image) throw new NotFoundError("Image not found")
		res.status(201).json(withLatestVersion(image))
	} catch (error) {
		await Promise.all(storedUrls.map((url) => storage.remove(url)))
		if (transcodeSource) await discardStagedVideo(transcodeSource)
		respondWithError(res, error, "upload media version")
	}
}

export const getProjectImages = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = authorizedScope(res)
		const images = await imageService.getImagesForProject(
			projectId,
			folderScopeOf(req)
		)
		res.status(200).json(images)
	} catch (error) {
		respondWithError(res, error, "list project media")
	}
}

export const getImage = async (req: Request, res: Response): Promise<void> => {
	try {
		const image = await imageService.getImageById(req.params.id)
		if (!image) throw new NotFoundError("Image not found")
		res.status(200).json(withLatestVersion(image))
	} catch (error) {
		respondWithError(res, error, "fetch image")
	}
}

export const getImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const version = await imageService.getImageVersionById(req.params.versionId)
		if (!version) throw new NotFoundError("Image version not found")
		res.status(200).json(version)
	} catch (error) {
		respondWithError(res, error, "fetch image version")
	}
}

const DOWNLOAD_URL_TTL_SECONDS = 300

export const downloadOriginal = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const version = await imageService.getVersionForDownload(
			req.params.versionId
		)
		const storedPath = version ? storedPathOf(version.url) : null
		if (!version || !storedPath) {
			throw new NotFoundError("Image version not found")
		}

		await recordAudit({
			action: "media.downloaded",
			targetType: "imageVersion",
			targetId: req.params.versionId,
			actorId: userId,
			metadata: {
				imageName: version.image.name,
				versionNumber: version.versionNumber,
			},
			ipAddress: requestIp(req),
		})

		if (storage.temporaryReadUrl) {
			res.redirect(
				302,
				await storage.temporaryReadUrl(storedPath, DOWNLOAD_URL_TTL_SECONDS)
			)
			return
		}

		res.download(
			path.join(uploadsDir, storedPath),
			downloadFileName(version.image.name, version.versionNumber, storedPath),
			(error) => {
				if (error && !res.headersSent) {
					res.status(404).json({ message: "Not found" })
				}
			}
		)
	} catch (error) {
		respondWithError(res, error, "download original media")
	}
}

export const deleteImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		await imageService.deleteImage(req.params.id)
		await recordAudit({
			action: "media.deleted",
			targetType: "image",
			targetId: req.params.id,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "delete image")
	}
}

export const deleteImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		await imageService.deleteImageVersion(req.params.versionId)
		await recordAudit({
			action: "media.version_deleted",
			targetType: "image_version",
			targetId: req.params.versionId,
			actorId: userId,
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "delete image version")
	}
}

export const updateImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { userId } = authorizedScope(res)
		const { name } = req.body
		const updated = await imageService.updateImage(req.params.id, { name })
		await recordAudit({
			action: "media.updated",
			targetType: "image",
			targetId: req.params.id,
			actorId: userId,
			metadata: { name },
			ipAddress: requestIp(req),
		})
		res.status(200).json(updated)
	} catch (error) {
		respondWithError(res, error, "rename image")
	}
}

export const updateImageVersion = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const updated = await imageService.updateImageVersion(
			req.params.versionId,
			{ versionName: req.body.versionName }
		)
		res.status(200).json(updated)
	} catch (error) {
		respondWithError(res, error, "rename image version")
	}
}
