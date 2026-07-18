"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"

export interface PresencePeer {
	socketId: string
	user: { id: string; name: string | null; avatarUrl?: string | null }
	time: number
}

const BROADCAST_THROTTLE_MS = 1000
const SEND_IMMEDIATELY_ON_SEEK_SECONDS = 3

export function usePresence(
	imageVersionId: string | null,
	currentTime: number
) {
	const { user } = useAuth()
	const { socket, isConnected } = useSocket()
	const [peers, setPeers] = useState<Record<string, PresencePeer>>({})
	const lastSentAtRef = useRef(0)
	const lastSentTimeRef = useRef(0)

	useEffect(() => {
		setPeers({})
	}, [imageVersionId])

	useEffect(() => {
		if (!socket || !isConnected || !imageVersionId) return

		const handleState = (payload: {
			imageVersionId: string
			peers: PresencePeer[]
		}) => {
			if (payload.imageVersionId !== imageVersionId) return
			setPeers(
				Object.fromEntries(
					payload.peers
						.filter((p) => p.socketId !== socket.id)
						.map((p) => [p.socketId, p])
				)
			)
		}

		const handlePeer = (payload: PresencePeer & { imageVersionId: string }) => {
			if (
				payload.imageVersionId !== imageVersionId ||
				payload.socketId === socket.id
			) {
				return
			}
			setPeers((prev) => ({ ...prev, [payload.socketId]: payload }))
		}

		const handleLeave = (payload: {
			socketId: string
			imageVersionId: string
		}) => {
			if (payload.imageVersionId !== imageVersionId) return
			setPeers((prev) => {
				if (!(payload.socketId in prev)) return prev
				const next = { ...prev }
				delete next[payload.socketId]
				return next
			})
		}

		socket.on("presence:state", handleState)
		socket.on("presence:peer", handlePeer)
		socket.on("presence:leave", handleLeave)
		return () => {
			socket.off("presence:state", handleState)
			socket.off("presence:peer", handlePeer)
			socket.off("presence:leave", handleLeave)
		}
	}, [socket, isConnected, imageVersionId])

	useEffect(() => {
		if (!socket || !isConnected || !imageVersionId) return
		const now = Date.now()
		const seeked =
			Math.abs(currentTime - lastSentTimeRef.current) >
			SEND_IMMEDIATELY_ON_SEEK_SECONDS
		if (!seeked && now - lastSentAtRef.current < BROADCAST_THROTTLE_MS) return
		lastSentAtRef.current = now
		lastSentTimeRef.current = currentTime
		socket.emit("presence:update", { imageVersionId, time: currentTime })
	}, [socket, isConnected, imageVersionId, currentTime])

	return useMemo(
		() => Object.values(peers).filter((p) => p.user.id !== user?.id),
		[peers, user?.id]
	)
}
