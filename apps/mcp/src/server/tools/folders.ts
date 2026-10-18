import { z } from "zod"
import { defineTool } from "../tool-kit.js"
import { idOf, pathSegment } from "../inputs.js"

const folders = (projectId: string) => `/api/projects/${pathSegment(projectId)}/folders`

const optionalFolder = z
	.string()
	.trim()
	.max(64)
	.nullable()
	.describe("The destination folder id, or null for the project's top level.")

export const folderTools = [
	defineTool({
		name: "list_folders",
		title: "List folders",
		description: "Lists every folder in a project with its parent, so you can rebuild the folder tree.",
		scope: "sculpt:read",
		effect: "read",
		input: { projectId: idOf("project") },
		run: async ({ projectId }, { api }) => ({ data: await api.get(folders(projectId)) }),
	}),
	defineTool({
		name: "create_folder",
		title: "Create folder",
		description: "Creates a folder at the top level of a project or inside another folder.",
		scope: "sculpt:content",
		effect: "write",
		input: {
			projectId: idOf("project"),
			name: z.string().trim().min(1).max(120),
			parentId: z.string().trim().max(64).optional().describe("Parent folder id; omit for the top level."),
		},
		run: async ({ projectId, name, parentId }, { api }) => {
			const folder = await api.post<{ id: string }>(folders(projectId), { name, parentId: parentId ?? null })
			return { summary: `Created folder "${name}".`, data: folder }
		},
	}),
	defineTool({
		name: "rename_folder",
		title: "Rename folder",
		description: "Renames a folder. Its contents and sub-folders stay where they are.",
		scope: "sculpt:content",
		effect: "write",
		idempotent: true,
		input: { projectId: idOf("project"), folderId: idOf("folder"), name: z.string().trim().min(1).max(120) },
		run: async ({ projectId, folderId, name }, { api }) => ({
			summary: `Folder renamed to "${name}".`,
			data: await api.patch(`${folders(projectId)}/${pathSegment(folderId)}`, { name }),
		}),
	}),
	defineTool({
		name: "move_folder",
		title: "Move folder",
		description: "Moves a folder (with everything in it) under another folder or to the top level.",
		scope: "sculpt:content",
		effect: "write",
		idempotent: true,
		input: { projectId: idOf("project"), folderId: idOf("folder"), parentId: optionalFolder },
		run: async ({ projectId, folderId, parentId }, { api }) => ({
			summary: "Folder moved.",
			data: await api.patch(`${folders(projectId)}/${pathSegment(folderId)}/parent`, { parentId }),
		}),
	}),
	defineTool({
		name: "delete_folder",
		title: "Delete folder",
		description:
			"Deletes a folder and its sub-folders. Media inside is not deleted; it moves to the top level. Confirm with the person first.",
		scope: "sculpt:content",
		effect: "destructive",
		idempotent: true,
		input: { projectId: idOf("project"), folderId: idOf("folder") },
		run: async ({ projectId, folderId }, { api }) => {
			await api.delete(`${folders(projectId)}/${pathSegment(folderId)}`)
			return { summary: "Folder deleted." }
		},
	}),
	defineTool({
		name: "move_media",
		title: "Move media into a folder",
		description: "Moves one or more media items into a folder, or to the top level with folderId null.",
		scope: "sculpt:content",
		effect: "write",
		idempotent: true,
		input: {
			projectId: idOf("project"),
			imageIds: z.array(z.string().max(64)).min(1).max(100).describe("Media ids to move."),
			folderId: optionalFolder,
		},
		run: async ({ projectId, imageIds, folderId }, { api }) => ({
			summary: `Moved ${imageIds.length} item(s).`,
			data: await api.patch(`/api/projects/${pathSegment(projectId)}/images/folder`, { imageIds, folderId }),
		}),
	}),
]
