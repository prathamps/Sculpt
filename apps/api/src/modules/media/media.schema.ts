import { z } from "zod"

export const deleteImagesSchema = z.object({
	imageIds: z.array(z.string().max(64)).min(1).max(100),
})

const MAX_MEDIA_NAME_LENGTH = 255

export const renameImageSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name cannot be empty")
		.max(MAX_MEDIA_NAME_LENGTH),
})

export const renameVersionSchema = z.object({
	versionName: z
		.string()
		.trim()
		.min(1, "Version name cannot be empty")
		.max(MAX_MEDIA_NAME_LENGTH),
})
