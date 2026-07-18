import { describe, expect, it } from "vitest"
import {
	addViewer,
	updateViewer,
	removeViewer,
	getViewers,
} from "./viewerPresence"

const user = (id: string) => ({ id, name: id, avatarUrl: null })

describe("viewerPresence", () => {
	it("tracks viewers per version and per socket", () => {
		addViewer("v1", "s1", user("alice"))
		addViewer("v1", "s2", user("bob"))
		addViewer("v2", "s3", user("alice"))

		expect(getViewers("v1").map((v) => v.socketId).sort()).toEqual([
			"s1",
			"s2",
		])
		expect(getViewers("v2")).toHaveLength(1)

		removeViewer("v1", "s1")
		removeViewer("v1", "s2")
		removeViewer("v2", "s3")
	})

	it("supports the same user in multiple tabs", () => {
		addViewer("v3", "tab1", user("alice"))
		addViewer("v3", "tab2", user("alice"))

		expect(getViewers("v3")).toHaveLength(2)

		removeViewer("v3", "tab1")
		expect(getViewers("v3")).toHaveLength(1)
		removeViewer("v3", "tab2")
		expect(getViewers("v3")).toHaveLength(0)
	})

	it("updates playhead time only for known viewers", () => {
		addViewer("v4", "s1", user("alice"))

		expect(updateViewer("v4", "s1", 12.5)).toBe(true)
		expect(getViewers("v4")[0].time).toBe(12.5)
		expect(updateViewer("v4", "ghost", 3)).toBe(false)
		expect(updateViewer("missing", "s1", 3)).toBe(false)

		removeViewer("v4", "s1")
	})

	it("ignores removals of unknown viewers", () => {
		expect(() => removeViewer("nope", "s9")).not.toThrow()
	})
})
