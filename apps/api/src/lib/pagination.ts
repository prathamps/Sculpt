import { z } from "zod"

export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 100

export const paginationSchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	pageSize: z.coerce
		.number()
		.int()
		.positive()
		.max(MAX_PAGE_SIZE)
		.default(DEFAULT_PAGE_SIZE),
})

export interface PageRequest {
	page: number
	pageSize: number
}

export interface Paginated<T> {
	items: T[]
	total: number
	page: number
	pageSize: number
	totalPages: number
}

export const requestedPage = (query: unknown): PageRequest => {
	const parsed = paginationSchema.safeParse(query ?? {})
	return parsed.success
		? parsed.data
		: { page: 1, pageSize: DEFAULT_PAGE_SIZE }
}

export const skipTake = (page: PageRequest) => ({
	skip: (page.page - 1) * page.pageSize,
	take: page.pageSize,
})

export const paginated = <T>(
	items: T[],
	total: number,
	page: PageRequest
): Paginated<T> => ({
	items,
	total,
	page: page.page,
	pageSize: page.pageSize,
	totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
})
