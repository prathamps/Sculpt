import { describe, expect, it } from "vitest"
import { ALL_TOOLS } from "./index.js"
import { SCOPES } from "../../scopes.js"
import { annotationsFor } from "../tool-kit.js"

describe("tool registry", () => {
	it("gives every tool a unique snake_case name", () => {
		const names = ALL_TOOLS.map((tool) => tool.name)
		expect(new Set(names).size).toBe(names.length)
		names.forEach((name) => expect(name).toMatch(/^[a-z][a-z0-9_]*$/))
	})

	it("ties every tool to a scope the authorization server issues", () => {
		ALL_TOOLS.forEach((tool) => expect(SCOPES).toContain(tool.scope))
	})

	it("describes every tool well enough for a model to choose it", () => {
		ALL_TOOLS.forEach((tool) => {
			expect(tool.title.length, tool.name).toBeGreaterThan(3)
			expect(tool.description.length, tool.name).toBeGreaterThan(20)
		})
	})

	it("asks the assistant to confirm before irreversible deletions", () => {
		const permanent = ALL_TOOLS.filter(
			(tool) => tool.effect === "destructive" && /permanently|cannot be undone/i.test(tool.description)
		)
		expect(permanent.length).toBeGreaterThan(0)
		permanent.forEach((tool) => expect(tool.description, tool.name).toMatch(/confirm/i))
	})

	it("treats every change to who can access a project as destructive and asks for confirmation", () => {
		const accessChanges = ALL_TOOLS.filter((tool) => tool.scope === "sculpt:manage" && tool.effect !== "read")
		expect(accessChanges.length).toBeGreaterThan(5)
		accessChanges.forEach((tool) => {
			expect(tool.effect, tool.name).toBe("destructive")
			expect(tool.description, tool.name).toMatch(/confirm with the person/i)
		})
	})

	it("flags tools that fetch from arbitrary URLs as reaching outside Sculpt", () => {
		const fetching = ALL_TOOLS.filter((tool) => "sourceUrl" in tool.input).map((tool) => tool.name)
		expect(fetching).toEqual(expect.arrayContaining(["upload_media", "upload_version", "attach_file_to_comment"]))
		ALL_TOOLS.forEach((tool) =>
			expect(annotationsFor(tool).openWorldHint, tool.name).toBe(fetching.includes(tool.name))
		)
	})

	it("never marks a write as read-only", () => {
		const writesDeclaredAsReads = ALL_TOOLS.filter(
			(tool) => tool.effect === "read" && tool.scope !== "sculpt:read" && tool.scope !== "sculpt:manage"
		).map((tool) => tool.name)
		expect(writesDeclaredAsReads).toEqual([])
	})

	it("covers every area of the product", () => {
		const names = new Set(ALL_TOOLS.map((tool) => tool.name))
		for (const expected of [
			"list_projects",
			"create_project",
			"invite_member",
			"create_share_link",
			"create_folder",
			"upload_media",
			"upload_version",
			"view_version",
			"add_comment",
			"resolve_comment",
			"record_review_decision",
			"set_due_date",
			"search",
			"list_notifications",
			"export_feedback_report",
			"export_timeline_markers",
			"get_revision_checklist",
			"check_revision_item",
			"update_notification_preferences",
		]) {
			expect(names.has(expected), expected).toBe(true)
		}
	})
})
