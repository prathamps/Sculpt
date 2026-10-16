import { Image, MediaType } from "@/types"
import { Paginated } from "./api"

export const MEDIA_PAGE_SIZE = 60

export type MediaFileType = "all" | "image" | "video" | "pdf" | "model"
export type MediaSort = "newest" | "oldest" | "a-z" | "z-a"

export interface MediaFilters {
	folderId: string | null
	search: string
	fileType: MediaFileType
	sort: MediaSort
}

export interface MediaCounts {
	total: number
	images: number
	videos: number
	pdfs: number
	models: number
}

export type MediaPage = Paginated<Image> & { counts: MediaCounts }

export const EMPTY_MEDIA_COUNTS: MediaCounts = {
	total: 0,
	images: 0,
	videos: 0,
	pdfs: 0,
	models: 0,
}

const SERVER_MEDIA_TYPE: Record<Exclude<MediaFileType, "all">, MediaType> = {
	image: "IMAGE",
	video: "VIDEO",
	pdf: "PDF",
	model: "MODEL",
}

const ROOT_FOLDER = "root"

export const mediaListPath = (
	projectId: string,
	filters: MediaFilters,
	page: number
): string => {
	const params = new URLSearchParams({
		page: String(page),
		pageSize: String(MEDIA_PAGE_SIZE),
		folderId: filters.folderId ?? ROOT_FOLDER,
		sort: filters.sort,
	})
	const search = filters.search.trim()
	if (search) params.set("q", search)
	if (filters.fileType !== "all") {
		params.set("type", SERVER_MEDIA_TYPE[filters.fileType])
	}
	return `/api/projects/${projectId}/images?${params}`
}

export const appendPage = (loaded: Image[], next: Image[]): Image[] => {
	const seen = new Set(loaded.map((image) => image.id))
	return [...loaded, ...next.filter((image) => !seen.has(image.id))]
}
