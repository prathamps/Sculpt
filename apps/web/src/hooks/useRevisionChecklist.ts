"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useSocket } from "@/context/SocketContext"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { RevisionCheckItem, RevisionCheckStatus, RevisionChecklist } from "@/types"

const checklistPath = (versionId: string) =>
	`/api/images/versions/${versionId}/revision-check`

export function useRevisionChecklist(versionId: string | null, isFirstVersion: boolean) {
	const { socket, isConnected } = useSocket()
	const [checklist, setChecklist] = useState<RevisionChecklist | null>(null)
	const [pendingId, setPendingId] = useState<string | null>(null)
	const latestRequest = useRef(0)

	const refresh = useCallback(async () => {
		const request = ++latestRequest.current
		if (!versionId || isFirstVersion) {
			setChecklist(null)
			return
		}
		try {
			const result = await api.get<RevisionChecklist>(checklistPath(versionId))
			if (request === latestRequest.current && result.versionId === versionId) setChecklist(result)
		} catch {
			if (request === latestRequest.current) setChecklist(null)
		}
	}, [versionId, isFirstVersion])

	useEffect(() => {
		setChecklist(null)
		void refresh()
	}, [refresh])

	useEffect(() => {
		if (!socket || !isConnected || !versionId) return
		const onUpdate = (event: { versionId: string }) => {
			if (event.versionId === versionId) void refresh()
		}
		socket.on("revision-check-updated", onUpdate)
		return () => {
			socket.off("revision-check-updated", onUpdate)
		}
	}, [socket, isConnected, versionId, refresh])

	const setStatus = useCallback(
		async (item: RevisionCheckItem, status: RevisionCheckStatus | null) => {
			if (!versionId) return
			setPendingId(item.commentId)
			try {
				const path = `${checklistPath(versionId)}/${item.commentId}`
				if (status) await api.put(path, { status })
				else await api.delete(path)
				await refresh()
			} catch (error) {
				toast.error(describeError(error, "Could not record the check."))
			} finally {
				setPendingId(null)
			}
		},
		[refresh, versionId]
	)

	return { checklist, refresh, setStatus, pendingId }
}
