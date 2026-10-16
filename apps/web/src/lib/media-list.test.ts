import { describe, expect, it } from "vitest"
import { Image } from "@/types"
import { MEDIA_PAGE_SIZE, appendPage, mediaListPath } from "./media-list"

describe("mediaListPath", () => {
	it("asks the server for one page of the root folder by default", () => {
		const path = mediaListPath(
			"p1",
			{ folderId: null, search: "", fileType: "all", sort: "newest" },
			1
		)

		expect(path).toBe(
			`/api/projects/p1/images?page=1&pageSize=${MEDIA_PAGE_SIZE}&folderId=root&sort=newest`
		)
	})

	it("passes search, type and folder filters through to the server", () => {
		const path = mediaListPath(
			"p1",
			{ folderId: "f1", search: "  hero ", fileType: "model", sort: "a-z" },
			3
		)
		const params = new URL(path, "http://x").searchParams

		expect(params.get("page")).toBe("3")
		expect(params.get("folderId")).toBe("f1")
		expect(params.get("q")).toBe("hero")
		expect(params.get("type")).toBe("MODEL")
		expect(params.get("sort")).toBe("a-z")
	})
})

describe("appendPage", () => {
	it("skips files that shifted onto the next page after an upload", () => {
		const loaded = [{ id: "a" }, { id: "b" }] as Image[]
		const next = [{ id: "b" }, { id: "c" }] as Image[]

		expect(appendPage(loaded, next).map((image) => image.id)).toEqual([
			"a",
			"b",
			"c",
		])
	})
})
