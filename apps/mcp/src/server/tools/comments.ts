import { z } from "zod"
import { defineTool, ToolInputError } from "../tool-kit.js"
import { fileInput, idOf, page, pageSize, pathSegment } from "../inputs.js"
import { asBlob, resolveFile } from "../files.js"

export const AI_ANNOTATION_COLOR = "#E84747"
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const fraction = z.number().min(0).max(1)

const region = z
	.object({
		x: fraction.describe("Left edge, as a fraction of the width from the left (0-1)."),
		y: fraction.describe("Top edge, as a fraction of the height from the top (0-1)."),
		width: fraction.describe("Width as a fraction of the full width."),
		height: fraction.describe("Height as a fraction of the full height."),
	})
	.describe("A rectangle to draw around the area the comment is about.")

const shape = z.object({
	type: z.enum(["rect", "line", "pencil"]).describe("rect uses two corner points; line uses start and end; pencil is a freehand path."),
	points: z.array(z.object({ x: fraction, y: fraction })).min(2).max(500),
	color: z.string().max(32).optional(),
})

const vector3 = z.tuple([z.number(), z.number(), z.number()])

const modelAnchor = z
	.object({
		position: vector3.describe("Point on the model surface, in model coordinates."),
		normal: vector3.optional(),
		camera: z.object({ position: vector3, target: vector3 }).optional(),
	})
	.describe("Where on a 3D model the comment is pinned.")

interface Point {
	x: number
	y: number
}

interface Annotation {
	id: number
	type: "rect" | "line" | "pencil"
	color: string
	points: Point[]
	t?: number
	tEnd?: number
	page?: number
}

export interface AnnotationPlacement {
	region?: z.infer<typeof region>
	shapes?: z.infer<typeof shape>[]
	timestamp?: number
	timestampEnd?: number
	page?: number
}

export const annotationsFor = (placement: AnnotationPlacement, now = Date.now()): Annotation[] | null => {
	const drawn: Omit<Annotation, "id" | "t" | "tEnd" | "page">[] = []
	if (placement.region) {
		const { x, y, width, height } = placement.region
		if (x + width > 1.0001 || y + height > 1.0001) {
			throw new ToolInputError("The region extends past the edge of the media; keep x + width and y + height at most 1.")
		}
		drawn.push({
			type: "rect",
			color: AI_ANNOTATION_COLOR,
			points: [
				{ x, y },
				{ x: x + width, y: y + height },
			],
		})
	}
	for (const extra of placement.shapes ?? []) {
		drawn.push({ type: extra.type, color: extra.color ?? AI_ANNOTATION_COLOR, points: extra.points })
	}
	if (drawn.length === 0) return null
	return drawn.map((annotation, index) => ({
		...annotation,
		id: now + index,
		...(placement.timestamp !== undefined ? { t: placement.timestamp } : {}),
		...(placement.timestampEnd !== undefined ? { tEnd: placement.timestampEnd } : {}),
		...(placement.page !== undefined ? { page: placement.page } : {}),
	}))
}

const commentsOf = (versionId: string) => `/api/images/versions/${pathSegment(versionId)}/comments`
const comment = (commentId: string) => `/api/images/comments/${pathSegment(commentId)}`

const commentBody = {
	content: z.string().trim().min(1).max(5000).describe("The comment text."),
	mentionedUserIds: z
		.array(z.string().max(64))
		.max(30)
		.optional()
		.describe("User ids to @mention and notify (see list_members)."),
}

export const commentTools = [
	defineTool({
		name: "list_comments",
		title: "List comments on a version",
		description:
			"Lists the threads on a version, oldest first, with replies, likes, resolution, drawn annotations (fractions of width/height), video timestamps in seconds, PDF pages and 3D anchors.",
		scope: "sculpt:read",
		effect: "read",
		input: { versionId: idOf("version"), page, pageSize: pageSize(100) },
		run: async ({ versionId, page, pageSize }, { api }) => ({
			data: await api.get(commentsOf(versionId), { page, pageSize }),
		}),
	}),
	defineTool({
		name: "add_comment",
		title: "Comment on a version",
		description:
			"Starts a comment thread on a version. Anchor it so people see exactly what you mean: draw a region (fractions of width/height from the top-left), give a video timestamp in seconds, a PDF page, or a 3D model point. Use view_version first to look at the media.",
		scope: "sculpt:feedback",
		effect: "write",
		input: {
			versionId: idOf("version"),
			...commentBody,
			region: region.optional(),
			shapes: z.array(shape).max(20).optional().describe("Extra drawings: arrows (line), boxes (rect) or freehand paths."),
			timestamp: z.number().nonnegative().optional().describe("Video time in seconds the comment refers to."),
			timestampEnd: z.number().nonnegative().optional().describe("End of a time range, in seconds."),
			page: z.number().int().positive().max(10000).optional().describe("PDF page number."),
			modelAnchor: modelAnchor.optional(),
			internal: z
				.boolean()
				.optional()
				.describe("Visible only to editors and owners, never to viewers or members. Requires editor role."),
		},
		run: async ({ versionId, content, mentionedUserIds, region, shapes, timestamp, timestampEnd, page, modelAnchor, internal }, { api }) => {
			if (timestampEnd !== undefined && timestamp !== undefined && timestampEnd < timestamp) {
				throw new ToolInputError("timestampEnd must not be before timestamp.")
			}
			const created = await api.post<{ id: string }>(commentsOf(versionId), {
				content,
				mentionedUserIds,
				annotation: annotationsFor({ region, shapes, timestamp, timestampEnd, page }),
				timestamp,
				timestampEnd,
				page,
				modelAnchor,
				internal,
			})
			return { summary: `Comment posted (${created.id}).`, data: created }
		},
	}),
	defineTool({
		name: "reply_to_comment",
		title: "Reply to a comment",
		description: "Replies in an existing comment thread on a version. Participants are notified.",
		scope: "sculpt:feedback",
		effect: "write",
		input: {
			versionId: idOf("version the thread is on"),
			commentId: idOf("comment to reply to"),
			...commentBody,
		},
		run: async ({ versionId, commentId, content, mentionedUserIds }, { api }) => {
			const created = await api.post<{ id: string }>(commentsOf(versionId), {
				content,
				mentionedUserIds,
				parentId: commentId,
			})
			return { summary: `Reply posted (${created.id}).`, data: created }
		},
	}),
	defineTool({
		name: "edit_comment",
		title: "Edit your comment",
		description: "Changes the text of a comment you wrote. Earlier text is kept in the comment's history.",
		scope: "sculpt:feedback",
		effect: "write",
		idempotent: true,
		input: { commentId: idOf("comment"), content: commentBody.content },
		run: async ({ commentId, content }, { api }) => ({
			summary: "Comment updated.",
			data: await api.put(comment(commentId), { content }),
		}),
	}),
	defineTool({
		name: "delete_comment",
		title: "Delete a comment",
		description: "Deletes a comment you wrote (owners may delete anyone's). Replies go with it. Confirm with the person first.",
		scope: "sculpt:feedback",
		effect: "destructive",
		idempotent: true,
		input: { commentId: idOf("comment") },
		run: async ({ commentId }, { api }) => {
			await api.delete(comment(commentId))
			return { summary: "Comment deleted." }
		},
	}),
	defineTool({
		name: "resolve_comment",
		title: "Resolve or reopen a thread",
		description: "Marks a thread resolved when the feedback has been addressed, or reopens it.",
		scope: "sculpt:feedback",
		effect: "write",
		idempotent: true,
		input: { commentId: idOf("comment"), resolved: z.boolean().default(true) },
		run: async ({ commentId, resolved }, { api }) => {
			let state = await api.post<{ resolved: boolean }>(`${comment(commentId)}/resolve`)
			if (state.resolved !== resolved) {
				state = await api.post<{ resolved: boolean }>(`${comment(commentId)}/resolve`)
			}
			return { summary: state.resolved ? "Thread resolved." : "Thread reopened.", data: state }
		},
	}),
	defineTool({
		name: "like_comment",
		title: "Like or unlike a comment",
		description: "Toggles your like on a comment: likes it if you have not, otherwise removes your like.",
		scope: "sculpt:feedback",
		effect: "write",
		input: { commentId: idOf("comment") },
		run: async ({ commentId }, { api }) => ({ data: await api.post(`${comment(commentId)}/like`) }),
	}),
	defineTool({
		name: "list_comment_history",
		title: "Comment edit history",
		description: "Lists earlier versions of a comment's text.",
		scope: "sculpt:read",
		effect: "read",
		input: { commentId: idOf("comment") },
		run: async ({ commentId }, { api }) => ({ data: await api.get(`${comment(commentId)}/revisions`) }),
	}),
	defineTool({
		name: "attach_file_to_comment",
		title: "Attach a reference file to a comment",
		description: "Attaches a reference image or document to a comment you wrote.",
		scope: "sculpt:feedback",
		effect: "write",
		input: { commentId: idOf("comment"), ...fileInput },
		run: async ({ commentId, ...fileArgs }, { api, config }) => {
			const file = await resolveFile(fileArgs, Math.min(config.maxUploadBytes, MAX_ATTACHMENT_BYTES))
			const form = new FormData()
			form.append("files", asBlob(file), file.fileName)
			return {
				summary: `Attached "${file.fileName}".`,
				data: await api.upload(`${comment(commentId)}/attachments`, form),
			}
		},
	}),
]
