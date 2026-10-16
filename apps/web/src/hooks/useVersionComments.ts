"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { Paginated, api } from "@/lib/api"
import {
	insertIntoThread,
	mergePages,
	removeFromThread,
	updateInThread,
} from "@/lib/comment-thread"
import { Comment } from "@/types"

const COMMENT_PAGE_SIZE = 50

const pageNumbersUpTo = (count: number): number[] =>
	Array.from({ length: Math.max(1, count) }, (_, index) => index + 1)

export function useVersionComments(imageVersionId: string | null) {
	const { user } = useAuth()
	const {
		socket,
		isConnected,
		reconnectCount,
		joinImageVersion,
		leaveImageVersion,
	} = useSocket()
	const [comments, setComments] = useState<Comment[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [loadedPages, setLoadedPages] = useState(0)
	const [totalPages, setTotalPages] = useState(0)
	const loadedPagesRef = useRef(0)

	const rememberLoadedPages = useCallback((count: number) => {
		loadedPagesRef.current = count
		setLoadedPages(count)
	}, [])

	const fetchPage = useCallback(
		async (page: number): Promise<Paginated<Comment> | null> => {
			if (!imageVersionId) return null
			return api.get<Paginated<Comment>>(
				`/api/images/versions/${imageVersionId}/comments?page=${page}&pageSize=${COMMENT_PAGE_SIZE}`
			)
		},
		[imageVersionId]
	)

	const refetch = useCallback(async () => {
		if (!imageVersionId) return
		setIsLoading(true)
		setError(null)
		try {
			const pages = await Promise.all(
				pageNumbersUpTo(loadedPagesRef.current).map(fetchPage)
			)
			const loaded = pages.filter(
				(page): page is Paginated<Comment> => page !== null
			)
			const lastPage = loaded.at(-1)
			if (!lastPage) return
			setComments(mergePages(loaded.map((page) => page.items)))
			setTotalPages(lastPage.totalPages)
			rememberLoadedPages(loaded.length)
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not load comments."
			)
		} finally {
			setIsLoading(false)
		}
	}, [imageVersionId, fetchPage, rememberLoadedPages])

	const loadMore = useCallback(async () => {
		if (isLoadingMore || loadedPages === 0 || loadedPages >= totalPages) return
		setIsLoadingMore(true)
		try {
			const next = await fetchPage(loadedPages + 1)
			if (!next) return
			setComments((prev) => mergePages([prev, next.items]))
			setTotalPages(next.totalPages)
			rememberLoadedPages(loadedPages + 1)
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not load comments."
			)
		} finally {
			setIsLoadingMore(false)
		}
	}, [fetchPage, isLoadingMore, loadedPages, totalPages, rememberLoadedPages])

	const syncAfterChange = useCallback(() => {
		if (!isConnected) void refetch()
	}, [isConnected, refetch])

	useEffect(() => {
		setComments([])
		rememberLoadedPages(0)
		setTotalPages(0)
		void refetch()
	}, [refetch, rememberLoadedPages])

	useEffect(() => {
		if (!imageVersionId || reconnectCount === 0) return
		void refetch()
	}, [reconnectCount, imageVersionId, refetch])

	useEffect(() => {
		if (!imageVersionId) return
		joinImageVersion(imageVersionId)
	}, [imageVersionId, joinImageVersion])

	useEffect(() => {
		if (!socket || !imageVersionId) return

		const isForThisVersion = (versionId: string) => versionId === imageVersionId

		const handleNewComment = (newComment: Comment) => {
			if (!isForThisVersion(newComment.imageVersionId)) return
			setComments((prev) => insertIntoThread(prev, newComment))
		}

		const handleCommentUpdated = (updatedComment: Comment) => {
			if (!isForThisVersion(updatedComment.imageVersionId)) return
			setComments((prev) =>
				updateInThread(prev, updatedComment.id, (comment) => ({
					...comment,
					...updatedComment,
				}))
			)
		}

		const handleCommentDeleted = (payload: {
			id: string
			imageVersionId: string
		}) => {
			if (!isForThisVersion(payload.imageVersionId)) return
			setComments((prev) => removeFromThread(prev, payload.id))
		}

		const handleLikeUpdate = (payload: {
			id: string
			count: number
			liked: boolean
			userId: string
			imageVersionId: string
		}) => {
			if (!isForThisVersion(payload.imageVersionId)) return
			setComments((prev) =>
				updateInThread(prev, payload.id, (comment) => ({
					...comment,
					likeCount: payload.count,
					isLikedByCurrentUser:
						user?.id === payload.userId
							? payload.liked
							: comment.isLikedByCurrentUser,
				}))
			)
		}

		socket.on("new-comment", handleNewComment)
		socket.on("comment-updated", handleCommentUpdated)
		socket.on("comment-deleted", handleCommentDeleted)
		socket.on("comment-like-updated", handleLikeUpdate)

		return () => {
			socket.off("new-comment", handleNewComment)
			socket.off("comment-updated", handleCommentUpdated)
			socket.off("comment-deleted", handleCommentDeleted)
			socket.off("comment-like-updated", handleLikeUpdate)
		}
	}, [socket, isConnected, imageVersionId, user?.id])

	useEffect(
		() => () => {
			if (imageVersionId) leaveImageVersion(imageVersionId)
		},
		[imageVersionId, leaveImageVersion]
	)

	return {
		comments,
		isLoading,
		isLoadingMore,
		hasMore: loadedPages > 0 && loadedPages < totalPages,
		loadMore,
		error,
		refetch,
		syncAfterChange,
	}
}
