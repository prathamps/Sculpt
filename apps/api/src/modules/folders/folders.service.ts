import { Folder, Prisma } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { NotFoundError, ValidationError } from "../../lib/errors"

const FOLDER_NAME_CONFLICT = "P2002"

export interface FolderNode {
	id: string
	name: string
	parentId: string | null
	imageCount: number
}

const isNameConflict = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === FOLDER_NAME_CONFLICT

const assertNameAvailable = async (
	projectId: string,
	parentId: string | null,
	name: string,
	excludeFolderId?: string
): Promise<void> => {
	const clash = await prisma.folder.findFirst({
		where: {
			projectId,
			parentId,
			name,
			...(excludeFolderId ? { id: { not: excludeFolderId } } : {}),
		},
		select: { id: true },
	})
	if (clash) {
		throw new ValidationError("A folder with that name already exists here")
	}
}

const requireFolderInProject = async (
	folderId: string,
	projectId: string
): Promise<Folder> => {
	const folder = await prisma.folder.findFirst({
		where: { id: folderId, projectId },
	})
	if (!folder) throw new NotFoundError("Folder not found")
	return folder
}

export const listFolders = async (projectId: string): Promise<FolderNode[]> => {
	const folders = await prisma.folder.findMany({
		where: { projectId },
		orderBy: { name: "asc" },
		select: {
			id: true,
			name: true,
			parentId: true,
			_count: { select: { images: true } },
		},
	})
	return folders.map((folder) => ({
		id: folder.id,
		name: folder.name,
		parentId: folder.parentId,
		imageCount: folder._count.images,
	}))
}

export const folderPath = async (
	folderId: string,
	projectId: string
): Promise<{ id: string; name: string }[]> => {
	const trail: { id: string; name: string }[] = []
	let current: Folder | null = await requireFolderInProject(folderId, projectId)

	while (current) {
		trail.unshift({ id: current.id, name: current.name })
		current = current.parentId
			? await prisma.folder.findFirst({
					where: { id: current.parentId, projectId },
				})
			: null
	}

	return trail
}

export const createFolder = async (
	projectId: string,
	name: string,
	parentId: string | null
): Promise<Folder> => {
	if (parentId) await requireFolderInProject(parentId, projectId)
	await assertNameAvailable(projectId, parentId, name)

	try {
		return await prisma.folder.create({
			data: { projectId, name, parentId },
		})
	} catch (error) {
		if (isNameConflict(error)) {
			throw new ValidationError("A folder with that name already exists here")
		}
		throw error
	}
}

export const renameFolder = async (
	folderId: string,
	projectId: string,
	name: string
): Promise<Folder> => {
	const existing = await requireFolderInProject(folderId, projectId)
	await assertNameAvailable(projectId, existing.parentId, name, folderId)

	try {
		return await prisma.folder.update({ where: { id: folderId }, data: { name } })
	} catch (error) {
		if (isNameConflict(error)) {
			throw new ValidationError("A folder with that name already exists here")
		}
		throw error
	}
}

export const isDescendantOf = async (
	candidateId: string,
	ancestorId: string,
	projectId: string
): Promise<boolean> => {
	let current = await prisma.folder.findFirst({
		where: { id: candidateId, projectId },
		select: { parentId: true },
	})

	while (current?.parentId) {
		if (current.parentId === ancestorId) return true
		current = await prisma.folder.findFirst({
			where: { id: current.parentId, projectId },
			select: { parentId: true },
		})
	}

	return false
}

export const moveFolder = async (
	folderId: string,
	projectId: string,
	parentId: string | null
): Promise<Folder> => {
	const moving = await requireFolderInProject(folderId, projectId)

	if (parentId) {
		if (parentId === folderId) {
			throw new ValidationError("A folder cannot contain itself")
		}
		await requireFolderInProject(parentId, projectId)
		if (await isDescendantOf(parentId, folderId, projectId)) {
			throw new ValidationError("A folder cannot be moved inside itself")
		}
	}

	await assertNameAvailable(projectId, parentId, moving.name, folderId)

	try {
		return await prisma.folder.update({
			where: { id: folderId },
			data: { parentId },
		})
	} catch (error) {
		if (isNameConflict(error)) {
			throw new ValidationError("A folder with that name already exists there")
		}
		throw error
	}
}

export const deleteFolder = async (
	folderId: string,
	projectId: string
): Promise<void> => {
	await requireFolderInProject(folderId, projectId)
	await prisma.folder.delete({ where: { id: folderId } })
}

export const moveImageToFolder = async (
	imageId: string,
	projectId: string,
	folderId: string | null
): Promise<void> => {
	await moveImagesToFolder([imageId], projectId, folderId)
}

export const moveImagesToFolder = async (
	imageIds: string[],
	projectId: string,
	folderId: string | null
): Promise<number> => {
	const ids = Array.from(new Set(imageIds))
	if (ids.length === 0) return 0

	const owned = await prisma.image.findMany({
		where: { id: { in: ids }, projectId },
		select: { id: true },
	})
	if (owned.length !== ids.length) {
		throw new NotFoundError("Image not found")
	}

	if (folderId) await requireFolderInProject(folderId, projectId)

	const { count } = await prisma.image.updateMany({
		where: { id: { in: ids }, projectId },
		data: { folderId },
	})
	return count
}
