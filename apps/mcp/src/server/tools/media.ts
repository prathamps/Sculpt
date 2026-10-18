import { z } from "zod"
import { defineTool, ToolContext, ToolInputError } from "../tool-kit.js"
import { fileInput, idOf, mediaType, page, pageSize, pathSegment } from "../inputs.js"
import { UPLOADABLE_MODEL_TYPES, asBlob, resolveFile } from "../files.js"
import { SculptApiError } from "../../sculpt/api-client.js"

export interface Version {
	id: string
	imageId: string
	url: string
	versionName: string
	versionNumber: number
	mediaType: "IMAGE" | "VIDEO" | "PDF" | "MODEL"
	thumbnailUrl: string | null
	proxyUrl: string | null
	proxyStatus: "PENDING" | "READY" | "FAILED" | null
	reviewStatus: string
	duration: number | null
	frameRate: number | null
	startTimecode?: string | null
	dueAt: string | null
}

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])
const PROCESSING_POLL_MS = 2000
const DEFAULT_WAIT_SECONDS = 30
const MAX_WAIT_SECONDS = 120

const version = (versionId: string) => `/api/images/versions/${pathSegment(versionId)}`
const media = (imageId: string) => `/api/images/${pathSegment(imageId)}`

export const previewCandidates = (subject: Pick<Version, "mediaType" | "url" | "proxyUrl" | "thumbnailUrl">): string[] => {
	const ordered =
		subject.mediaType === "IMAGE"
			? [subject.proxyUrl, subject.url, subject.thumbnailUrl]
			: [subject.thumbnailUrl]
	return Array.from(new Set(ordered.filter((url): url is string => !!url)))
}

export const fetchPreview = async (subject: Version, { api, config }: Pick<ToolContext, "api" | "config">) => {
	for (const candidate of previewCandidates(subject)) {
		try {
			const file = await api.media(candidate, config.maxImageBytes)
			if (INLINE_IMAGE_TYPES.has(file.mimeType)) return file
		} catch (error) {
			if (!(error instanceof SculptApiError) || ![403, 404, 413].includes(error.status)) throw error
		}
	}
	return null
}

const describeVersion = (subject: Version): string => {
	const kind = subject.mediaType.toLowerCase()
	const timing =
		subject.mediaType === "VIDEO" && subject.duration
			? ` It runs ${subject.duration.toFixed(1)} s${subject.frameRate ? ` at ${subject.frameRate} fps` : ""}${subject.startTimecode ? `, starting at timecode ${subject.startTimecode}` : ""}; this is its poster frame.`
			: subject.mediaType === "PDF"
				? " This is the first page."
				: subject.mediaType === "MODEL"
					? " This is a rendered thumbnail of the 3D model."
					: ""
	return `${subject.versionName} (version ${subject.versionNumber}, ${kind}, review status ${subject.reviewStatus}).${timing} When you comment on a region, give coordinates as fractions of the width and height measured from the top-left corner (0 to 1).`
}

const assertUploadable = (mimeType: string): void => {
	if (mimeType.startsWith("model/") && !UPLOADABLE_MODEL_TYPES.has(mimeType)) {
		throw new ToolInputError(
			"Through an AI assistant Sculpt accepts 3D models as GLB or glTF. Other 3D formats are converted in the browser, so upload them in Sculpt directly."
		)
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const mediaTools = [
	defineTool({
		name: "list_media",
		title: "List media in a project",
		description:
			"Lists media items (images, videos, PDFs, 3D models) in a project with their latest version. Filter by folder, search text or type. Each item has versions; comments and reviews belong to a version.",
		scope: "sculpt:read",
		effect: "read",
		input: {
			projectId: idOf("project"),
			folderId: z.string().max(64).optional().describe('Folder id, or "root" for the top level only. Omit to list everything.'),
			query: z.string().trim().max(200).optional().describe("Search by name."),
			mediaType: mediaType.optional(),
			sort: z.enum(["newest", "oldest", "a-z", "z-a"]).optional(),
			page,
			pageSize: pageSize(200),
		},
		run: async ({ projectId, folderId, query, mediaType, sort, page, pageSize }, { api }) => ({
			data: await api.get(`/api/projects/${pathSegment(projectId)}/images`, {
				folderId,
				q: query,
				type: mediaType,
				sort,
				page: page ?? 1,
				pageSize: pageSize ?? 60,
			}),
		}),
	}),
	defineTool({
		name: "get_media",
		title: "Get a media item",
		description: "Returns a media item with every version, newest first.",
		scope: "sculpt:read",
		effect: "read",
		input: { imageId: idOf("media item") },
		run: async ({ imageId }, { api }) => ({ data: await api.get(media(imageId)) }),
	}),
	defineTool({
		name: "get_version",
		title: "Get a version",
		description: "Returns one version: its type, processing state, review status, due date, duration and frame rate.",
		scope: "sculpt:read",
		effect: "read",
		input: { versionId: idOf("version") },
		run: async ({ versionId }, { api }) => ({ data: await api.get(version(versionId)) }),
	}),
	defineTool({
		name: "view_version",
		title: "Look at a version",
		description:
			"Shows you the version as an image so you can review it: the picture itself for images, the poster frame for videos, the first page for PDFs and a render for 3D models. Use it before giving visual feedback.",
		scope: "sculpt:read",
		effect: "read",
		input: { versionId: idOf("version") },
		run: async ({ versionId }, context) => {
			const subject = await context.api.get<Version>(version(versionId))
			const preview = await fetchPreview(subject, context)
			if (!preview) {
				return {
					summary: `${describeVersion(subject)} No viewable preview is available${subject.proxyStatus === "PENDING" ? " yet: it is still processing. Try wait_for_processing first" : ""}.`,
				}
			}
			return {
				summary: describeVersion(subject),
				content: [{ type: "image", data: preview.bytes.toString("base64"), mimeType: preview.mimeType }],
			}
		},
	}),
	defineTool({
		name: "wait_for_processing",
		title: "Wait for a version to finish processing",
		description:
			"Videos and some image formats are converted after upload. Waits until the version is ready (or failed), up to timeoutSeconds.",
		scope: "sculpt:read",
		effect: "read",
		input: {
			versionId: idOf("version"),
			timeoutSeconds: z.number().int().positive().max(MAX_WAIT_SECONDS).optional(),
		},
		run: async ({ versionId, timeoutSeconds }, { api }) => {
			const deadline = Date.now() + (timeoutSeconds ?? DEFAULT_WAIT_SECONDS) * 1000
			let current = await api.get<Version>(version(versionId))
			while (current.proxyStatus === "PENDING" && Date.now() < deadline) {
				await sleep(PROCESSING_POLL_MS)
				current = await api.get<Version>(version(versionId))
			}
			const state = current.proxyStatus ?? "READY"
			return {
				summary:
					state === "PENDING"
						? "Still processing. Call again to keep waiting."
						: state === "FAILED"
							? "Processing failed; viewers fall back to the original file."
							: "Ready.",
				data: current,
			}
		},
	}),
	defineTool({
		name: "upload_media",
		title: "Upload a new media item",
		description:
			"Adds a new image, video, PDF or GLB/glTF model to a project (optionally into a folder). Videos are transcoded in the background; use wait_for_processing before viewing.",
		scope: "sculpt:content",
		effect: "write",
		input: {
			projectId: idOf("project"),
			folderId: z.string().max(64).optional().describe("Folder to upload into; omit for the top level."),
			...fileInput,
		},
		run: async ({ projectId, folderId, ...fileArgs }, { api, config }) => {
			const file = await resolveFile(fileArgs, config.maxUploadBytes)
			assertUploadable(file.mimeType)
			const form = new FormData()
			form.append("images", asBlob(file), file.fileName)
			if (folderId) form.append("folderId", folderId)
			const [created] = await api.upload<{ id: string; name: string }[]>(
				`/api/projects/${pathSegment(projectId)}/images`,
				form
			)
			return { summary: `Uploaded "${file.fileName}".`, data: created }
		},
	}),
	defineTool({
		name: "upload_version",
		title: "Upload a new version",
		description: "Adds a new version to an existing media item, for example a revised design after feedback.",
		scope: "sculpt:content",
		effect: "write",
		input: {
			imageId: idOf("media item"),
			versionName: z.string().trim().min(1).max(255).optional().describe('A label such as "v3 – colour fixes".'),
			...fileInput,
		},
		run: async ({ imageId, versionName, ...fileArgs }, { api, config }) => {
			const file = await resolveFile(fileArgs, config.maxUploadBytes)
			assertUploadable(file.mimeType)
			const form = new FormData()
			form.append("image", asBlob(file), file.fileName)
			if (versionName) form.append("versionName", versionName)
			const updated = await api.upload<{ latestVersion?: Version }>(`${media(imageId)}/versions`, form)
			const number = updated.latestVersion?.versionNumber
			return {
				summary: number ? `Uploaded version ${number}.` : "Uploaded a new version.",
				data: updated,
			}
		},
	}),
	defineTool({
		name: "rename_media",
		title: "Rename a media item",
		description: "Renames a media item. Its versions, comments and reviews are unaffected.",
		scope: "sculpt:content",
		effect: "write",
		idempotent: true,
		input: { imageId: idOf("media item"), name: z.string().trim().min(1).max(255) },
		run: async ({ imageId, name }, { api }) => ({
			summary: `Renamed to "${name}".`,
			data: await api.put(media(imageId), { name }),
		}),
	}),
	defineTool({
		name: "rename_version",
		title: "Rename a version",
		description: "Changes a version's label, such as \"v2 – colour fixes\". The version number stays the same.",
		scope: "sculpt:content",
		effect: "write",
		idempotent: true,
		input: { versionId: idOf("version"), versionName: z.string().trim().min(1).max(255) },
		run: async ({ versionId, versionName }, { api }) => ({
			summary: `Version renamed to "${versionName}".`,
			data: await api.put(version(versionId), { versionName }),
		}),
	}),
	defineTool({
		name: "delete_media",
		title: "Delete media items",
		description:
			"Permanently deletes media items with all their versions, comments and reviews. Cannot be undone. Confirm with the person first.",
		scope: "sculpt:content",
		effect: "destructive",
		input: {
			projectId: idOf("project"),
			imageIds: z.array(z.string().max(64)).min(1).max(100),
		},
		run: async ({ projectId, imageIds }, { api }) => ({
			summary: `Deleted ${imageIds.length} item(s).`,
			data: await api.post(`/api/projects/${pathSegment(projectId)}/images/delete`, { imageIds }),
		}),
	}),
	defineTool({
		name: "delete_version",
		title: "Delete a version",
		description:
			"Permanently deletes one version with its comments and reviews. Cannot be undone. Confirm with the person first.",
		scope: "sculpt:content",
		effect: "destructive",
		input: { versionId: idOf("version") },
		run: async ({ versionId }, { api }) => {
			await api.delete(version(versionId))
			return { summary: "Version deleted." }
		},
	}),
]
