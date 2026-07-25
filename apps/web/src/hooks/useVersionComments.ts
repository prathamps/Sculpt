"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { Comment } from "@/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export function useVersionComments(imageVersionId: string | null) {
	const { user } = useAuth()
	const { socket, isConnected, joinImageVersion, leaveImageVersion } =
		useSocket()
	const [comments, setComments] = useState<Comment[]>([])
	const [isLoading, setIsLoading] = useState(false)

	const refetch = useCallback(async () => {
		if (!imageVersionId) return
		setIsLoading(true)
		try {
			const res = await fetch(
				`${API_URL}/api/images/versions/${imageVersionId}/comments`,
				{ credentials: "include" }
			)
			if (res.ok) setComments(await res.json())
		} catch (error) {
			console.error("Failed to fetch comments:", error)
		} finally {
			setIsLoading(false)
		}
	}, [imageVersionId])

	useEffect(() => {
		setComments([])
		refetch()
	}, [refetch])

	useEffect(() => {
		if (!socket || !isConnected || !imageVersionId) return

		joinImageVersion(imageVersionId)

		const handleNewComment = (newComment: Comment) => {
			if (newComment.imageVersionId !== imageVersionId) return
			setComments((prev) =>
				prev.some((c) => c.id === newComment.id)
					? prev
					: [newComment, ...prev]
			)
		}

		const handleCommentUpdated = (updatedComment: Comment) => {
			if (updatedComment.imageVersionId !== imageVersionId) return
			setComments((prev) =>
				prev.map((c) => (c.id === updatedComment.id ? updatedComment : c))
			)
		}

		const handleCommentDeleted = (payload: {
			id: string
			imageVersionId: string
		}) => {
			if (payload.imageVersionId !== imageVersionId) return
			setComments((prev) => prev.filter((c) => c.id !== payload.id))
		}

		const handleLikeUpdate = (payload: {
			id: string
			count: number
			liked: boolean
			userId: string
			imageVersionId: string
		}) => {
			if (payload.imageVersionId !== imageVersionId) return
			setComments((prev) =>
				prev.map((c) =>
					c.id === payload.id
						? {
								...c,
								likeCount: payload.count,
								isLikedByCurrentUser:
									user?.id === payload.userId
										? payload.liked
										: c.isLikedByCurrentUser,
						  }
						: c
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
	}, [socket, isConnected, imageVersionId, user?.id, joinImageVersion])

	useEffect(() => {
		return () => {
			if (imageVersionId) leaveImageVersion(imageVersionId)
		}
	}, [imageVersionId, leaveImageVersion])

	return { comments, isLoading, refetch }
}
