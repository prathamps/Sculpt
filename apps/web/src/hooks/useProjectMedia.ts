"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Image } from "@/types"

export function useProjectMedia(
	projectId: string | null,
	isAuthenticated: boolean
) {
	const [images, setImages] = useState<Image[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const refresh = useCallback(async () => {
		if (!projectId || !isAuthenticated) return
		setIsLoading(true)
		setError(null)
		try {
			setImages(await api.get<Image[]>(`/api/projects/${projectId}/images`))
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not load files."
			)
		} finally {
			setIsLoading(false)
		}
	}, [projectId, isAuthenticated])

	useEffect(() => {
		setImages([])
		void refresh()
	}, [refresh])

	return { images, isLoading, error, refresh }
}
