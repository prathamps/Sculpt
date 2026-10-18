import { z } from "zod"
import { defineTool } from "../tool-kit.js"
import { idOf, pathSegment } from "../inputs.js"
import { SculptApiError } from "../../sculpt/api-client.js"

const reviews = (versionId: string) => `/api/images/versions/${pathSegment(versionId)}/reviews`
const revisionCheck = (versionId: string) =>
	`/api/images/versions/${pathSegment(versionId)}/revision-check`

export const reviewTools = [
	defineTool({
		name: "get_revision_checklist",
		title: "Check which earlier feedback a version fixes",
		description:
			"Lists every open comment from earlier versions of the same file that this version should address, with where it was anchored (timestamp, page or 3D pin), whether it has been confirmed fixed or flagged as still open on this version, and counts. Use it with view_version to verify a revision.",
		scope: "sculpt:read",
		effect: "read",
		input: { versionId: idOf("version") },
		run: async ({ versionId }, { api }) => ({ data: await api.get(revisionCheck(versionId)) }),
	}),
	defineTool({
		name: "check_revision_item",
		title: "Mark earlier feedback fixed or still open",
		description:
			"Records whether a comment from an earlier version is fixed in this version. FIXED resolves the original comment (only its author or an editor may do this); NOT_FIXED carries it forward and reopens it if this version had marked it fixed; CLEAR removes your verdict.",
		scope: "sculpt:feedback",
		effect: "write",
		idempotent: true,
		input: {
			versionId: idOf("version"),
			commentId: idOf("comment from an earlier version"),
			status: z.enum(["FIXED", "NOT_FIXED", "CLEAR"]),
		},
		run: async ({ versionId, commentId, status }, { api }) => {
			const path = `${revisionCheck(versionId)}/${pathSegment(commentId)}`
			if (status === "CLEAR") {
				try {
					await api.delete(path)
				} catch (error) {
					if (!(error instanceof SculptApiError) || error.status !== 404) throw error
					return { summary: "There was no verdict to remove." }
				}
				return { summary: "Revision check removed." }
			}
			return {
				summary: status === "FIXED" ? "Confirmed fixed." : "Flagged as still not fixed.",
				data: await api.put(path, { status }),
			}
		},
	}),
	defineTool({
		name: "list_review_decisions",
		title: "List review decisions",
		description:
			"Lists who approved or requested changes on a version, with their notes. One changes-requested decision outweighs any number of approvals.",
		scope: "sculpt:read",
		effect: "read",
		input: { versionId: idOf("version") },
		run: async ({ versionId }, { api }) => ({ data: await api.get(reviews(versionId)) }),
	}),
	defineTool({
		name: "record_review_decision",
		title: "Approve or request changes",
		description:
			"Records your review decision on a version, replacing any earlier decision of yours. Everyone in the project is notified.",
		scope: "sculpt:feedback",
		effect: "write",
		idempotent: true,
		input: {
			versionId: idOf("version"),
			decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
			note: z.string().trim().max(2000).optional().describe("Why, in a sentence or two."),
		},
		run: async ({ versionId, decision, note }, { api }) => ({
			summary: decision === "APPROVED" ? "Version approved." : "Changes requested.",
			data: await api.post(reviews(versionId), { decision, note }),
		}),
	}),
	defineTool({
		name: "withdraw_review_decision",
		title: "Withdraw your review decision",
		description: "Removes your approval or change request from a version.",
		scope: "sculpt:feedback",
		effect: "write",
		idempotent: true,
		input: { versionId: idOf("version") },
		run: async ({ versionId }, { api }) => ({
			summary: "Decision withdrawn.",
			data: await api.delete(reviews(versionId)),
		}),
	}),
	defineTool({
		name: "set_due_date",
		title: "Set a review due date",
		description: "Sets or clears the date a version's review is due. Requires editor role.",
		scope: "sculpt:content",
		effect: "write",
		idempotent: true,
		input: {
			versionId: idOf("version"),
			dueAt: z
				.string()
				.datetime({ offset: true })
				.nullable()
				.describe("ISO 8601 date-time, e.g. 2026-11-01T17:00:00Z, or null to clear."),
		},
		run: async ({ versionId, dueAt }, { api }) => ({
			summary: dueAt ? `Due ${dueAt}.` : "Due date cleared.",
			data: await api.patch(`/api/images/versions/${pathSegment(versionId)}/due-date`, { dueAt }),
		}),
	}),
]
