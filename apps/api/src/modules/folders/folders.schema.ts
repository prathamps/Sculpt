import { z } from "zod"

const folderName = z
	.string()
	.trim()
	.min(1, "Folder name cannot be empty")
	.max(120)

export const createFolderSchema = z.object({
	name: folderName,
	parentId: z.string().max(64).nullish(),
})

export const renameFolderSchema = z.object({
	name: folderName,
})

export const moveFolderSchema = z.object({
	parentId: z.string().max(64).nullable(),
})

export const moveImageSchema = z.object({
	folderId: z.string().max(64).nullable(),
})

export const moveImagesSchema = z.object({
	imageIds: z.array(z.string().max(64)).min(1).max(100),
	folderId: z.string().max(64).nullable(),
})
