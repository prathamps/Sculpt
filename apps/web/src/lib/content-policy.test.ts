import { describe, expect, it } from "vitest"
import { mayDownloadOriginals } from "./content-policy"

describe("mayDownloadOriginals", () => {
	it("offers downloads to every member while they are allowed", () => {
		expect(mayDownloadOriginals({ allowDownloads: true, watermarkViewers: false }, "VIEWER")).toBe(true)
	})

	it("hides downloads from viewers and members once they are turned off", () => {
		const locked = { allowDownloads: false, watermarkViewers: false }
		expect(mayDownloadOriginals(locked, "VIEWER")).toBe(false)
		expect(mayDownloadOriginals(locked, "MEMBER")).toBe(false)
		expect(mayDownloadOriginals(locked, "EDITOR")).toBe(true)
	})
})
