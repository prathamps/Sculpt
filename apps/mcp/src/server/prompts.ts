import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { Caller } from "../auth/caller.js"

const userMessage = (text: string) => ({
	messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
})

export const registerPrompts = (server: McpServer, caller: Caller): void => {
	if (!caller.scopes.has("sculpt:read")) return
	const canGiveFeedback = caller.scopes.has("sculpt:feedback")

	server.registerPrompt(
		"review_version",
		{
			title: "Review a version",
			description: "Look at a version, read the existing feedback and leave precise, anchored review comments.",
			argsSchema: {
				versionId: z.string().describe("The version to review."),
				focus: z.string().optional().describe("What to pay attention to, e.g. brand colours or typography."),
			},
		},
		({ versionId, focus }) =>
			userMessage(
				[
					`Review Sculpt version ${versionId}.`,
					focus ? `Focus on: ${focus}.` : "",
					"1. Call view_version to look at it and get_version for its details.",
					"2. Call list_comments and list_review_decisions so you do not repeat existing feedback.",
					canGiveFeedback
						? "3. For each issue, call add_comment with a short actionable note and a region (fractions of width/height from the top-left) or a video timestamp, so the team sees exactly where. 4. Finish with record_review_decision: APPROVED if it is ready, otherwise CHANGES_REQUESTED with a one-line note."
						: "3. Write your review as a list of issues with their locations. This connection cannot post comments.",
				]
					.filter(Boolean)
					.join("\n")
			)
	)

	server.registerPrompt(
		"summarize_feedback",
		{
			title: "Summarise feedback",
			description: "Turn every thread on a version into a prioritised to-do list.",
			argsSchema: { versionId: z.string().describe("The version whose feedback to summarise.") },
		},
		({ versionId }) =>
			userMessage(
				`Read every comment thread on Sculpt version ${versionId} with list_comments (fetch all pages) and its decisions with list_review_decisions. Summarise the open feedback as a prioritised checklist, grouping duplicates, naming who asked for each change and where (region, timestamp or page). List resolved threads separately in one line each.`
			)
	)

	server.registerPrompt(
		"project_status",
		{
			title: "Project status report",
			description: "Report where every item in a project stands in review.",
			argsSchema: { projectId: z.string().describe("The project to report on.") },
		},
		({ projectId }) =>
			userMessage(
				`Write a status report for Sculpt project ${projectId}. Use get_project, get_review_summary and list_media (all pages). For items whose latest version has changes requested or is overdue, read its comments. Report: overall progress, what is approved, what is blocked and why, what is overdue, and suggested next steps.`
			)
	)

	server.registerPrompt(
		"triage_inbox",
		{
			title: "Triage my notifications",
			description: "Go through unread notifications and say what needs a reply.",
		},
		() =>
			userMessage(
				`Call list_notifications. For each unread one, open the related version's comments if needed and tell me what happened and whether I need to respond. Draft replies for the ones that need one, but do not post them until I confirm.${canGiveFeedback ? " When I have reviewed them, mark the handled notifications read." : ""}`
			)
	)
}
