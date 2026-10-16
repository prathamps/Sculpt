import { z } from "zod"
import { MediaType } from "@prisma/client"

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

export const MEDIA_SORTS = ["newest", "oldest", "a-z", "z-a"] as const
export type MediaSort = (typeof MEDIA_SORTS)[number]

export const DEFAULT_MEDIA_PAGE_SIZE = 60
const MAX_MEDIA_PAGE_SIZE = 200
const MAX_MEDIA_SEARCH_LENGTH = 200

export const listMediaQuerySchema = z.object({
	folderId: z.string().max(64).optional(),
	page: z.coerce.number().int().positive().optional(),
	pageSize: z.coerce
		.number()
		.int()
		.positive()
		.max(MAX_MEDIA_PAGE_SIZE)
		.default(DEFAULT_MEDIA_PAGE_SIZE),
	sort: z.enum(MEDIA_SORTS).default("newest"),
	q: z.string().trim().max(MAX_MEDIA_SEARCH_LENGTH).optional(),
	type: z.enum(MediaType).optional(),
})

export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>
