import { Request, Response } from "express"
import * as folderService from "./folders.service"
import { authorizedScope } from "../../middleware/authorize.middleware"
import { respondWithError } from "../../lib/http"
import { recordAudit, requestIp } from "../audit/audit.service"

export const listFolders = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = authorizedScope(res)
		res.status(200).json(await folderService.listFolders(projectId))
	} catch (error) {
		respondWithError(res, error, "list folders")
	}
}

export const getFolderPath = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId } = authorizedScope(res)
		const path = await folderService.folderPath(req.params.folderId, projectId)
		res.status(200).json(path)
	} catch (error) {
		respondWithError(res, error, "resolve folder path")
	}
}

export const createFolder = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId, userId } = authorizedScope(res)
		const folder = await folderService.createFolder(
			projectId,
			req.body.name,
			req.body.parentId ?? null
		)
		await recordAudit({
			action: "folder.created",
			targetType: "folder",
			targetId: folder.id,
			actorId: userId,
			metadata: { name: folder.name, projectId },
			ipAddress: requestIp(req),
		})
		res.status(201).json(folder)
	} catch (error) {
		respondWithError(res, error, "create folder")
	}
}

export const renameFolder = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId, userId } = authorizedScope(res)
		const folder = await folderService.renameFolder(
			req.params.folderId,
			projectId,
			req.body.name
		)
		await recordAudit({
			action: "folder.renamed",
			targetType: "folder",
			targetId: folder.id,
			actorId: userId,
			metadata: { name: folder.name, projectId },
			ipAddress: requestIp(req),
		})
		res.status(200).json(folder)
	} catch (error) {
		respondWithError(res, error, "rename folder")
	}
}

export const moveFolder = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId, userId } = authorizedScope(res)
		const folder = await folderService.moveFolder(
			req.params.folderId,
			projectId,
			req.body.parentId ?? null
		)
		await recordAudit({
			action: "folder.moved",
			targetType: "folder",
			targetId: folder.id,
			actorId: userId,
			metadata: { parentId: folder.parentId, projectId },
			ipAddress: requestIp(req),
		})
		res.status(200).json(folder)
	} catch (error) {
		respondWithError(res, error, "move folder")
	}
}

export const deleteFolder = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId, userId } = authorizedScope(res)
		await folderService.deleteFolder(req.params.folderId, projectId)
		await recordAudit({
			action: "folder.deleted",
			targetType: "folder",
			targetId: req.params.folderId,
			actorId: userId,
			metadata: { projectId },
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "delete folder")
	}
}

export const moveImage = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const { projectId, userId } = authorizedScope(res)
		await folderService.moveImageToFolder(
			req.params.imageId,
			projectId,
			req.body.folderId ?? null
		)
		await recordAudit({
			action: "media.moved",
			targetType: "image",
			targetId: req.params.imageId,
			actorId: userId,
			metadata: { folderId: req.body.folderId ?? null, projectId },
			ipAddress: requestIp(req),
		})
		res.status(204).send()
	} catch (error) {
		respondWithError(res, error, "move image")
	}
}
