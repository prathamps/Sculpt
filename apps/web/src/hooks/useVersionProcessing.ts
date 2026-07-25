"use client"

import { useEffect } from "react"
import { useSocket } from "@/context/SocketContext"
import { ImageVersion } from "@/types"

export type VersionProcessingUpdate = Pick<
	ImageVersion,
	"id" | "imageId" | "proxyUrl" | "proxyStatus" | "duration" | "thumbnailUrl"
>

export function useVersionProcessingUpdates(
	imageVersionId: string | null,
	onUpdate: (update: VersionProcessingUpdate) => void
) {
	const { socket, isConnected } = useSocket()

	useEffect(() => {
		if (!socket || !isConnected || !imageVersionId) return

		const handleVersionUpdated = (update: VersionProcessingUpdate) => {
			if (update.id === imageVersionId) onUpdate(update)
		}

		socket.on("version-updated", handleVersionUpdated)
		return () => {
			socket.off("version-updated", handleVersionUpdated)
		}
	}, [socket, isConnected, imageVersionId, onUpdate])
}
