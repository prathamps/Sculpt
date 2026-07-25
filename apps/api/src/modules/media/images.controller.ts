import { AuthenticatedUser } from "../../types"
import { Request, Response } from "express"
import fs from "fs"
import * as imageService from "./images.service"
import { CommentsService } from "../comments/comments.service"
import { detectMediaType } from "../../middleware/upload.middleware"
import { parseFilesMeta } from "./upload-meta"
import {
	discardStagedVideo,
	enqueueVideoProxy,
	stageVideoForProcessing,
} from "./video-pipeline"
import { storage } from "../../storage"
import { AppError } from "../../lib/errors"
import { recordAudit, requestIp } from "../audit/audit.service"
import {
	getImageProjectId,
	getVersionProjectId,
	getCommentProjectId,
	getMemberRole,
	roleMeets,
} from "../projects/access"
import { ProjectRole, ProxyStatus } from "@prisma/client"

const requireUserId = (req: Request, res: Response): string | null => {
	const userId = (req.user as AuthenticatedUser)?.id
	if (!userId) {
		res.status(401).json({ message: "Unauthorized" })
		return null
	}
	return userId
}

const denyUnlessRole = async (
	res: Response,
	projectId: string | null,
	userId: string,
	minimum: ProjectRole
): Promise<boolean> => {
	if (!projectId) {
		res.status(404).json({ message: "Not found" })
		return false
	}
	const role = await getMemberRole(projectId, userId)
	if (!role) {
		res.status(403).json({ message: "You are not a member of this project" })
		return false
	}
	if (!roleMeets(role, minimum)) {
		res.status(403).json({ message: "Your project role does not allow this" })
		return false
	}
	return true
}

const authorizeProject = async (
	req: Request,
	res: Response,
	projectId: string,
	minimum: ProjectRole = "VIEWER"
): Promise<string | null> => {
	const userId = requireUserId(req, res)
	if (!userId) return null
	return (await denyUnlessRole(res, projectId, userId, minimum)) ? userId : null
}

const authorizeImage = async (
	req: Request,
	res: Response,
	imageId: string,
	minimum: ProjectRole = "VIEWER"
): Promise<string | null> => {
	const userId = requireUserId(req, res)
	if (!userId) return null
	return (await denyUnlessRole(
		res,
		await getImageProjectId(imageId),
		userId,
		minimum
	))
		? userId
		: null
}

const authorizeVersion = async (
	req: Request,
	res: Response,
	versionId: string,
	minimum: ProjectRole = "VIEWER"
): Promise<string | null> => {
	const userId = requireUserId(req, res)
	if (!userId) return null
	return (await denyUnlessRole(
		res,
		await getVersionProjectId(versionId),
		userId,
		minimum
	))
		? userId
		: null
}

const authorizeComment = async (
	req: Request,
	res: Response,
	commentId: string,
	minimum: ProjectRole = "VIEWER"
): Promise<string | null> => {
	const userId = requireUserId(req, res)
	if (!userId) return null
	return (await denyUnlessRole(
		res,
		await getCommentProjectId(commentId),
		userId,
		minimum
	))
		? userId
		: null
}

const withLatestVersion = (
	image: NonNullable<Awaited<ReturnType<typeof imageService.getImageById>>>
) => ({
	...image,
	latestVersion: image.versions[0] ?? null,
})

type UploadFields = Record<string, Express.Multer.File[] | undefined>

const discardStagedFiles = async (
	files: Express.Multer.File[]
): Promise<void> => {
	await Promise.all(
		files.map((file) => fs.promises.unlink(file.path).catch(() => undefined))
	)
}

export const uploadImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	const { projectId } = req.params
	const userId = await authorizeProject(req, res, projectId, "EDITOR")
	if (!userId) return

	const fields = (req.files ?? {}) as UploadFields
	const files = fields.images ?? []
	const thumbnails = fields.thumbnails ?? []
	const modelProxies = fields.modelProxies ?? []
	if (files.length === 0) {
		await discardStagedFiles([...thumbnails, ...modelProxies])
		res.status(400).send("No files uploaded.")
		return
	}

	let metas
	try {
		metas = parseFilesMeta(
			req.body.filesMeta,
			files.length,
			{ thumbnails: thumbnails.length, modelProxies: modelProxies.length },
			req.body.duration ? Number(req.body.duration) : null
		)
	} catch (error) {
		await discardStagedFiles([...files, ...thumbnails, ...modelProxies])
		if (error instanceof AppError) {
			res.status(error.statusCode).json({ message: error.message })
			return
		}
		throw error
	}

	const storedUrls: string[] = []
	const stagedVideoSources: (string | null)[] = []
	try {
		const imagePayloads = []
		let thumbnailIndex = 0
		let modelProxyIndex = 0
		for (const [index, file] of files.entries()) {
			const mediaType = detectMediaType(file.mimetype)
			const transcodeSource =
				mediaType === "VIDEO"
					? await stageVideoForProcessing(file.path)
					: null
			stagedVideoSources.push(transcodeSource)

			const url = await storage.store({
				path: file.path,
				originalName: file.originalname,
				mimeType: file.mimetype,
			})
			storedUrls.push(url)

			let thumbnailUrl: string | null = null
			if (metas[index].hasThumbnail) {
				const thumbnail = thumbnails[thumbnailIndex++]
				thumbnailUrl = await storage.store({
					path: thumbnail.path,
					originalName: thumbnail.originalname,
					mimeType: thumbnail.mimetype,
				})
				storedUrls.push(thumbnailUrl)
			}

			let modelProxyUrl: string | null = null
			if (metas[index].hasModelProxy) {
				const converted = modelProxies[modelProxyIndex++]
				modelProxyUrl = await storage.store({
					path: converted.path,
					originalName: converted.originalname,
					mimeType: converted.mimetype,
				})
				storedUrls.push(modelProxyUrl)
			}

			imagePayloads.push({
				url,
				name: file.originalname,
				projectId,
				mediaType,
				duration: metas[index].duration,
				thumbnailUrl,
				proxyUrl: modelProxyUrl,
				proxyStatus: transcodeSource
					? ProxyStatus.PENDING
					: modelProxyUrl
						? ProxyStatus.READY
						: null,
			})
		}

		const created = await imageService.addImagesToProject(imagePayloads)
		created.forEach((image, index) => {
			const sourcePath = stagedVideoSources[index]
			const firstVersion = image.versions[0]
			if (sourcePath && firstVersion) {
				enqueueVideoProxy({
					versionId: firstVersion.id,
					sourcePath,
					needsPoster: !imagePayloads[index].thumbnailUrl,
				})
			}
		})

		await recordAudit({
			action: "media.uploaded",
			targetType: "project",
			targetId: projectId,
			actorId: userId,
			metadata: { files: imagePayloads.map((p) => p.name) },
			ipAddress: requestIp(req),
		})

		if (created.length > 0) {
			const newImages = await imageService.getImagesForProject(projectId)
			res.status(201).json(newImages)
		} else {
			res.status(201).json({ count: 0 })
		}
	} catch (error) {
		await Promise.all(storedUrls.map((url) => storage.remove(url)))
		await Promise.all(
			stagedVideoSources
				.filter((source): source is string => !!source)
				.map(discardStagedVideo)
		)
		res.status(500).json({ message: "Error uploading image", error })
	}
}

export const getProjectImages = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = req.params
		if (!(await authorizeProject(req, res, projectId))) return
		const images = await imageService.getImagesForProject(projectId)
		res.status(200).json(images)
	} catch (error) {
		res.status(500).json({ message: "Error fetching images", error })
	}
}

export const getImage = async (req: Request, res: Response): Promise<void> => {
	try {
		const { id } = req.params
		if (!(await authorizeImage(req, res, id))) return
		const image = await imageService.getImageById(id)
		if (!image) {
			res.status(404).json({ message: "Image not found" })
			return
		}
		res.status(200).json(withLatestVersion(image))
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
		if (!(await authorizeVersion(req, res, versionId))) return
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
	const { imageId } = req.params
	const userId = await authorizeImage(req, res, imageId, "EDITOR")
	if (!userId) return

	const fields = (req.files ?? {}) as UploadFields
	const file = fields.image?.[0]
	const thumbnail = fields.thumbnail?.[0]
	const modelProxy = fields.modelProxy?.[0]
	if (!file) {
		await discardStagedFiles(
			[thumbnail, modelProxy].filter((f): f is Express.Multer.File => !!f)
		)
		res.status(400).send("No file uploaded.")
		return
	}

	const storedUrls: string[] = []
	let transcodeSource: string | null = null
	try {
		const mediaType = detectMediaType(file.mimetype)
		transcodeSource =
			mediaType === "VIDEO" ? await stageVideoForProcessing(file.path) : null

		const url = await storage.store({
			path: file.path,
			originalName: file.originalname,
			mimeType: file.mimetype,
		})
		storedUrls.push(url)

		let thumbnailUrl: string | null = null
		if (thumbnail) {
			thumbnailUrl = await storage.store({
				path: thumbnail.path,
				originalName: thumbnail.originalname,
				mimeType: thumbnail.mimetype,
			})
			storedUrls.push(thumbnailUrl)
		}

		let modelProxyUrl: string | null = null
		if (modelProxy) {
			modelProxyUrl = await storage.store({
				path: modelProxy.path,
				originalName: modelProxy.originalname,
				mimeType: modelProxy.mimetype,
			})
			storedUrls.push(modelProxyUrl)
		}

		const version = await imageService.addImageVersion(imageId, url, {
			versionName: req.body.versionName,
			mediaType,
			duration: req.body.duration ? Number(req.body.duration) : null,
			thumbnailUrl,
			proxyUrl: modelProxyUrl,
			proxyStatus: transcodeSource
				? ProxyStatus.PENDING
				: modelProxyUrl
					? ProxyStatus.READY
					: null,
		})
		if (transcodeSource) {
			enqueueVideoProxy({
				versionId: version.id,
				sourcePath: transcodeSource,
				needsPoster: !thumbnailUrl,
			})
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
		if (!image) {
			res.status(404).json({ message: "Image not found" })
			return
		}
		res.status(201).json(withLatestVersion(image))
	} catch (error) {
		await Promise.all(storedUrls.map((url) => storage.remove(url)))
		if (transcodeSource) await discardStagedVideo(transcodeSource)
		res.status(500).json({ message: "Error uploading image version", error })
	}
}

export const deleteImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { id } = req.params
		const userId = await authorizeImage(req, res, id, "EDITOR")
		if (!userId) return
		await imageService.deleteImage(id)
		await recordAudit({
			action: "media.deleted",
			targetType: "image",
			targetId: id,
			actorId: userId,
			ipAddress: requestIp(req),
		})
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
		const userId = await authorizeVersion(req, res, versionId, "EDITOR")
		if (!userId) return
		await imageService.deleteImageVersion(versionId)
		await recordAudit({
			action: "media.version_deleted",
			targetType: "image_version",
			targetId: versionId,
			actorId: userId,
			ipAddress: requestIp(req),
		})
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
		const userId = await authorizeImage(req, res, id, "EDITOR")
		if (!userId) return
		const { name } = req.body
		const updatedImage = await imageService.updateImage(id, { name })
		await recordAudit({
			action: "media.updated",
			targetType: "image",
			targetId: id,
			actorId: userId,
			metadata: { name },
			ipAddress: requestIp(req),
		})
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
		if (!(await authorizeVersion(req, res, versionId, "EDITOR"))) return
		const { versionName } = req.body
		const updatedVersion = await imageService.updateImageVersion(versionId, {
			versionName,
		})
		res.status(200).json(updatedVersion)
	} catch (error) {
		res.status(500).json({ message: "Error updating image version", error })
	}
}

export const addComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageVersionId } = req.params
		const userId = await authorizeVersion(req, res, imageVersionId, "MEMBER")
		if (!userId) return

		const {
			content,
			parentId,
			annotation,
			timestamp,
			timestampEnd,
			page,
			modelAnchor,
		} = req.body

		const comment = await CommentsService.createComment({
			content,
			imageVersionId,
			userId,
			parentId: parentId || null,
			annotation: annotation || null,
			timestamp: typeof timestamp === "number" ? timestamp : null,
			timestampEnd: typeof timestampEnd === "number" ? timestampEnd : null,
			page: typeof page === "number" ? page : null,
			modelAnchor: modelAnchor ?? null,
		})
		res.status(201).json(comment)
	} catch (error) {
		if (error instanceof AppError) {
			res.status(error.statusCode).json({ message: error.message })
		} else {
			res.status(500).json({ message: "Error adding comment", error })
		}
	}
}

export const getComments = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { imageVersionId } = req.params
		const userId = await authorizeVersion(req, res, imageVersionId)
		if (!userId) return
		const comments = await CommentsService.getCommentsByImageVersionId(
			imageVersionId,
			userId
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
		const userId = await authorizeComment(req, res, req.params.commentId, "MEMBER")
		if (!userId) return

		await CommentsService.deleteComment(req.params.commentId, userId)
		res.status(204).send()
	} catch (error) {
		if (error instanceof AppError) {
			res.status(error.statusCode).json({ message: error.message })
		} else {
			res.status(500).json({ message: "Error deleting comment", error })
		}
	}
}

export const toggleLikeComment = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const userId = await authorizeComment(req, res, req.params.commentId, "MEMBER")
		if (!userId) return

		const result = await CommentsService.toggleLike(
			req.params.commentId,
			userId
		)
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
		const userId = await authorizeComment(req, res, req.params.commentId, "MEMBER")
		if (!userId) return

		const result = await CommentsService.toggleResolved(
			req.params.commentId,
			userId
		)
		res.status(200).json(result)
	} catch (error) {
		if (error instanceof AppError) {
			res.status(error.statusCode).json({ message: error.message })
		} else {
			res
				.status(500)
				.json({ message: "Error toggling comment resolved status", error })
		}
	}
}
