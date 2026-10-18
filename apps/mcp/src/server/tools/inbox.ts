import { z } from "zod"
import { defineTool } from "../tool-kit.js"
import { idOf, mediaType, page, pageSize, pathSegment, reviewStatus } from "../inputs.js"

export const inboxTools = [
	defineTool({
		name: "search",
		title: "Search Sculpt",
		description:
			"Searches every project you can see for projects, media, versions and comments matching the text. Optionally filter media by type or review status.",
		scope: "sculpt:read",
		effect: "read",
		input: {
			query: z.string().trim().min(1).max(200),
			mediaType: mediaType.optional(),
			reviewStatus: reviewStatus.optional(),
			limit: z.number().int().positive().max(50).optional(),
		},
		run: async ({ query, mediaType, reviewStatus, limit }, { api }) => ({
			data: await api.get("/api/search", { q: query, mediaType, reviewStatus, limit }),
		}),
	}),
	defineTool({
		name: "list_notifications",
		title: "List notifications",
		description: "Lists your notifications, newest first: mentions, comments, replies, review decisions and invitations.",
		scope: "sculpt:read",
		effect: "read",
		input: { page, pageSize: pageSize(100) },
		run: async ({ page, pageSize }, { api }) => ({
			data: await api.get("/api/notifications", { page, pageSize }),
		}),
	}),
	defineTool({
		name: "mark_notification_read",
		title: "Mark a notification read",
		description: "Marks one notification as read once you have dealt with it.",
		scope: "sculpt:feedback",
		effect: "write",
		idempotent: true,
		input: { notificationId: idOf("notification") },
		run: async ({ notificationId }, { api }) => ({
			data: await api.put(`/api/notifications/${pathSegment(notificationId)}/read`),
		}),
	}),
	defineTool({
		name: "mark_all_notifications_read",
		title: "Mark all notifications read",
		description: "Marks every one of your notifications as read.",
		scope: "sculpt:feedback",
		effect: "write",
		idempotent: true,
		input: {},
		run: async (_args, { api }) => ({
			summary: "All notifications marked read.",
			data: await api.put("/api/notifications/read-all"),
		}),
	}),
	defineTool({
		name: "export_feedback_report",
		title: "Export a feedback report",
		description:
			"Exports every version, comment, reply and review decision on a media item as JSON (structured) or CSV (for spreadsheets).",
		scope: "sculpt:read",
		effect: "read",
		input: { imageId: idOf("media item"), format: z.enum(["json", "csv"]).default("json") },
		run: async ({ imageId, format }, { api }) => {
			const report = await api.get<unknown>(`/api/export/image/${pathSegment(imageId)}/report.${format}`)
			return format === "csv"
				? { content: [{ type: "text", text: String(report) }] }
				: { data: report }
		},
	}),
	defineTool({
		name: "export_timeline_markers",
		title: "Export timeline markers for an editor",
		description:
			"Exports a video version's timestamped comments as markers an editor imports onto their timeline: an EDL for DaVinci Resolve (Timeline > Import > Timeline Markers from EDL) or FCP7 XML for Premiere Pro and Final Cut Pro 7. Markers start at timelineStart, else the camera's own timecode, else 01:00:00:00.",
		scope: "sculpt:read",
		effect: "read",
		input: {
			versionId: idOf("video version"),
			format: z.enum(["edl", "xml"]).default("edl"),
			timelineStart: z
				.string()
				.regex(/^\d{2}:\d{2}:\d{2}[:;]\d{2}$/, "Use HH:MM:SS:FF")
				.optional(),
		},
		run: async ({ versionId, format, timelineStart }, { api }) => {
			const markers = await api.get<unknown>(
				`/api/export/version/${pathSegment(versionId)}/markers.${format}`,
				{ timelineStart }
			)
			return { content: [{ type: "text", text: String(markers) }] }
		},
	}),
]
