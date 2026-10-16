import { describe, expect, it } from "vitest"
import { Comment } from "@/types"
import {
	insertIntoThread,
	mergePages,
	removeFromThread,
	threadContains,
	updateInThread,
} from "./comment-thread"

const comment = (id: string, overrides: Partial<Comment> = {}): Comment =>
	({
		id,
		content: id,
		imageVersionId: "v1",
		userId: "u1",
		user: { id: "u1", email: "u1@example.com", name: "U" },
		resolved: false,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		replies: [],
		...overrides,
	}) as Comment

describe("insertIntoThread", () => {
	it("puts a new top-level comment first", () => {
		const thread = insertIntoThread([comment("a")], comment("b"))
		expect(thread.map((entry) => entry.id)).toEqual(["b", "a"])
	})

	it("nests a live reply under its parent instead of listing it at the top", () => {
		const thread = insertIntoThread(
			[comment("a"), comment("b")],
			comment("r1", { parentId: "b" })
		)

		expect(thread.map((entry) => entry.id)).toEqual(["a", "b"])
		expect(thread[1]?.replies?.map((reply) => reply.id)).toEqual(["r1"])
	})

	it("ignores an event it has already applied", () => {
		const initial = [comment("a", { replies: [comment("r1", { parentId: "a" })] })]

		expect(insertIntoThread(initial, comment("r1", { parentId: "a" }))).toBe(initial)
	})
})

describe("updateInThread", () => {
	it("updates a reply in place", () => {
		const thread = updateInThread(
			[comment("a", { replies: [comment("r1", { parentId: "a" })] })],
			"r1",
			(entry) => ({ ...entry, resolved: true })
		)

		expect(thread[0]?.replies?.[0]?.resolved).toBe(true)
	})
})

describe("removeFromThread", () => {
	it("removes a deleted reply from its parent", () => {
		const thread = removeFromThread(
			[comment("a", { replies: [comment("r1", { parentId: "a" })] })],
			"r1"
		)

		expect(thread[0]?.replies).toEqual([])
		expect(threadContains(thread, "r1")).toBe(false)
	})

	it("removes a deleted top-level comment", () => {
		expect(removeFromThread([comment("a"), comment("b")], "a")).toHaveLength(1)
	})
})

describe("mergePages", () => {
	it("keeps the first copy when pages overlap after new comments shift them", () => {
		const merged = mergePages([[comment("a"), comment("b")], [comment("b"), comment("c")]])
		expect(merged.map((entry) => entry.id)).toEqual(["a", "b", "c"])
	})
})
