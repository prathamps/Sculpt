import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { toast } from "sonner"

export interface FolderNode {
	id: string
	name: string
	parentId: string | null
	imageCount: number
}

export function useProjectFolders(projectId: string | null) {
	const [folders, setFolders] = useState<FolderNode[]>([])

	const refresh = useCallback(async (): Promise<void> => {
		if (!projectId) {
			setFolders([])
			return
		}
		try {
			setFolders(await api.get<FolderNode[]>(`/api/projects/${projectId}/folders`))
		} catch (error) {
			toast.error(describeError(error, "Could not load folders."))
		}
	}, [projectId])

	useEffect(() => {
		void refresh()
	}, [refresh])

	return { folders, refreshFolders: refresh }
}

export const folderTrail = (
	folders: FolderNode[],
	folderId: string | null
): FolderNode[] => {
	const byId = new Map(folders.map((folder) => [folder.id, folder]))
	const trail: FolderNode[] = []
	let current = folderId ? byId.get(folderId) : undefined

	while (current) {
		trail.unshift(current)
		current = current.parentId ? byId.get(current.parentId) : undefined
	}

	return trail
}

export const descendantIds = (
	folders: FolderNode[],
	folderId: string
): Set<string> => {
	const blocked = new Set([folderId])
	let grew = true

	while (grew) {
		grew = false
		for (const folder of folders) {
			if (folder.parentId && blocked.has(folder.parentId) && !blocked.has(folder.id)) {
				blocked.add(folder.id)
				grew = true
			}
		}
	}

	return blocked
}
