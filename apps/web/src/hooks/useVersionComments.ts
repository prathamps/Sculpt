"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { api } from "@/lib/api"
import { Comment } from "@/types"

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
	const [error, setError] = useState<string | null>(null)

	const refetch = useCallback(async () => {
		if (!imageVersionId) return
		setIsLoading(true)
		setError(null)
		try {
			setComments(
				await api.get<Comment[]>(
					`/api/images/versions/${imageVersionId}/comments`
				)
			)
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not load comments."
			)
		} finally {
			setIsLoading(false)
		}
	}, [imageVersionId])

	useEffect(() => {
		setComments([])
		void refetch()
	}, [refetch])

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
			setComments((prev) =>
				prev.some((comment) => comment.id === newComment.id)
					? prev
					: [newComment, ...prev]
			)
		}

		const handleCommentUpdated = (updatedComment: Comment) => {
			if (!isForThisVersion(updatedComment.imageVersionId)) return
			setComments((prev) =>
				prev.map((comment) =>
					comment.id === updatedComment.id
						? { ...comment, ...updatedComment }
						: comment
				)
			)
		}

		const handleCommentDeleted = (payload: {
			id: string
			imageVersionId: string
		}) => {
			if (!isForThisVersion(payload.imageVersionId)) return
			setComments((prev) => prev.filter((comment) => comment.id !== payload.id))
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
				prev.map((comment) =>
					comment.id === payload.id
						? {
								...comment,
								likeCount: payload.count,
								isLikedByCurrentUser:
									user?.id === payload.userId
										? payload.liked
										: comment.isLikedByCurrentUser,
							}
						: comment
				)
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

	return { comments, isLoading, error, refetch }
}
