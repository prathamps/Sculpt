"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Image, ImageVersion, ProjectRole } from "@/types"
import {
	VersionProcessingUpdate,
	useVersionProcessingUpdates,
} from "@/hooks/useVersionProcessing"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface UseFileViewerOptions {
	imageId: string
	projectId: string
	isAuthenticated: boolean
}

export function useFileViewer({
	imageId,
	projectId,
	isAuthenticated,
}: UseFileViewerOptions) {
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const searchParamsRef = useRef(searchParams)
	searchParamsRef.current = searchParams

	const [role, setRole] = useState<ProjectRole | null>(null)
	const [loadError, setLoadError] = useState(false)
	const [image, setImage] = useState<Image | null>(null)
	const [selectedVersion, setSelectedVersion] = useState<ImageVersion | null>(
		null
	)
	const [isImageLoading, setIsImageLoading] = useState(true)

	const buildUrl = useCallback(
		(updates: Record<string, string | null>) => {
			const next = new URLSearchParams(searchParamsRef.current.toString())
			for (const [key, value] of Object.entries(updates)) {
				if (value === null) next.delete(key)
				else next.set(key, value)
			}
			const qs = next.toString()
			return qs ? `${pathname}?${qs}` : pathname
		},
		[pathname]
	)

	const fetchImage = useCallback(async () => {
		if (!isAuthenticated) return
		setIsImageLoading(true)
		setLoadError(false)
		try {
			const res = await fetch(`${API_URL}/api/images/${imageId}`, {
				credentials: "include",
			})
			if (res.ok) {
				const data: Image = await res.json()
				setImage(data)
				const requested = searchParamsRef.current.get("v")
				const fromParam = data.versions?.find((v) => v.id === requested)
				setSelectedVersion(
					fromParam ?? data.latestVersion ?? data.versions?.[0] ?? null
				)
			} else {
				setLoadError(true)
			}
		} catch (error) {
			console.error("Failed to fetch image:", error)
			setLoadError(true)
		} finally {
			setIsImageLoading(false)
		}
	}, [isAuthenticated, imageId])

	useEffect(() => {
		fetchImage()
	}, [fetchImage])

	useEffect(() => {
		if (!isAuthenticated) return
		let cancelled = false

		const load = async (attempt = 0): Promise<void> => {
			try {
				const res = await fetch(
					`${API_URL}/api/projects/${projectId}/my-role`,
					{ credentials: "include" }
				)
				if (cancelled) return
				if (res.ok) {
					const data = await res.json()
					setRole(data?.role ?? null)
					return
				}
				if (res.status === 403) {
					setRole(null)
					return
				}
				throw new Error(`role fetch failed: ${res.status}`)
			} catch {
				if (cancelled || attempt >= 3) return
				setTimeout(() => load(attempt + 1), 1000 * (attempt + 1))
			}
		}

		load()
		return () => {
			cancelled = true
		}
	}, [isAuthenticated, projectId])

	const applyVersionUpdate = useCallback((update: VersionProcessingUpdate) => {
		const patch = (version: ImageVersion) =>
			version.id === update.id ? { ...version, ...update } : version
		setImage((prev) =>
			prev ? { ...prev, versions: prev.versions.map(patch) } : prev
		)
		setSelectedVersion((prev) => (prev ? patch(prev) : prev))
	}, [])
	useVersionProcessingUpdates(selectedVersion?.id ?? null, applyVersionUpdate)

	return {
		router,
		searchParams,
		buildUrl,
		role,
		loadError,
		image,
		setImage,
		selectedVersion,
		setSelectedVersion,
		isImageLoading,
		fetchImage,
	}
}

export function useCompareMode({
	image,
	selectedVersion,
	searchParams,
	buildUrl,
	router,
}: {
	image: Image | null
	selectedVersion: ImageVersion | null
	searchParams: ReturnType<typeof useSearchParams>
	buildUrl: (updates: Record<string, string | null>) => string
	router: ReturnType<typeof useRouter>
}) {
	const compareId = searchParams.get("compare")
	const compareVersion =
		compareId && image
			? (image.versions.find((v) => v.id === compareId) ?? null)
			: null
	const isCompareMode =
		!!compareVersion && !!selectedVersion && (image?.versions.length ?? 0) >= 2

	useEffect(() => {
		if (!image || !compareId) return
		const valid =
			image.versions.length >= 2 &&
			image.versions.some((v) => v.id === compareId)
		if (!valid) {
			router.replace(buildUrl({ compare: null }), { scroll: false })
		}
	}, [image, compareId, router, buildUrl])

	const enterCompare = () => {
		if (!image || !selectedVersion || image.versions.length < 2) return
		const other =
			image.versions.find((v) => v.id !== selectedVersion.id) ??
			selectedVersion
		router.push(buildUrl({ v: selectedVersion.id, compare: other.id }), {
			scroll: false,
		})
	}

	const exitCompare = () => {
		router.replace(buildUrl({ v: selectedVersion?.id ?? null, compare: null }), {
			scroll: false,
		})
	}

	return { compareId, compareVersion, isCompareMode, enterCompare, exitCompare }
}
