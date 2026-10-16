"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import {
	EMPTY_MEDIA_COUNTS,
	MediaCounts,
	MediaFilters,
	MediaPage,
	appendPage,
	mediaListPath,
} from "@/lib/media-list"
import { Image } from "@/types"

export function useProjectMedia(
	projectId: string | null,
	filters: MediaFilters,
	revision: number
) {
	const [images, setImages] = useState<Image[]>([])
	const [counts, setCounts] = useState<MediaCounts>(EMPTY_MEDIA_COUNTS)
	const [total, setTotal] = useState(0)
	const [loadedPages, setLoadedPages] = useState(0)
	const [totalPages, setTotalPages] = useState(0)
	const [isLoading, setIsLoading] = useState(true)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const requestRef = useRef<AbortController | null>(null)

	const { folderId, search, fileType, sort } = filters

	const applyPage = useCallback((page: MediaPage) => {
		setCounts(page.counts)
		setTotal(page.total)
		setTotalPages(page.totalPages)
	}, [])

	const refresh = useCallback(async () => {
		if (!projectId) return
		requestRef.current?.abort()
		const controller = new AbortController()
		requestRef.current = controller
		setIsLoading(true)
		setError(null)
		try {
			const first = await api.get<MediaPage>(
				mediaListPath(projectId, { folderId, search, fileType, sort }, 1),
				{ signal: controller.signal }
			)
			setImages(first.items)
			setLoadedPages(1)
			applyPage(first)
		} catch (caught) {
			if (controller.signal.aborted) return
			setError(caught instanceof Error ? caught.message : "Could not load files.")
		} finally {
			if (!controller.signal.aborted) setIsLoading(false)
		}
	}, [projectId, folderId, search, fileType, sort, applyPage])

	const loadMore = useCallback(async () => {
		if (!projectId || isLoadingMore || isLoading || loadedPages >= totalPages) {
			return
		}
		const controller = requestRef.current
		setIsLoadingMore(true)
		try {
			const next = await api.get<MediaPage>(
				mediaListPath(
					projectId,
					{ folderId, search, fileType, sort },
					loadedPages + 1
				),
				{ signal: controller?.signal }
			)
			setImages((loaded) => appendPage(loaded, next.items))
			setLoadedPages((pages) => pages + 1)
			applyPage(next)
		} catch (caught) {
			if (controller?.signal.aborted) return
			setError(caught instanceof Error ? caught.message : "Could not load files.")
		} finally {
			setIsLoadingMore(false)
		}
	}, [
		projectId,
		folderId,
		search,
		fileType,
		sort,
		isLoading,
		isLoadingMore,
		loadedPages,
		totalPages,
		applyPage,
	])

	useEffect(() => {
		void refresh()
	}, [refresh, revision])

	useEffect(() => () => requestRef.current?.abort(), [])

	return {
		images,
		counts,
		total,
		isLoading,
		isLoadingMore,
		hasMore: loadedPages < totalPages,
		loadMore,
		refresh,
		error,
	}
}
