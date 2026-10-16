import { describe, expect, it } from "vitest"
import { mayDownloadOriginals } from "./content-policy"

const downloadsOff = { allowDownloads: false, watermarkViewers: false }
const downloadsOn = { allowDownloads: true, watermarkViewers: false }

describe("mayDownloadOriginals", () => {
	it("lets every member download while downloads are allowed", () => {
		expect(mayDownloadOriginals(downloadsOn, "VIEWER")).toBe(true)
	})

	it("keeps originals with editors and owners once downloads are turned off", () => {
		expect(mayDownloadOriginals(downloadsOff, "VIEWER")).toBe(false)
		expect(mayDownloadOriginals(downloadsOff, "MEMBER")).toBe(false)
		expect(mayDownloadOriginals(downloadsOff, "EDITOR")).toBe(true)
		expect(mayDownloadOriginals(downloadsOff, "OWNER")).toBe(true)
	})

	it("never lets a non-member download", () => {
		expect(mayDownloadOriginals(downloadsOn, null)).toBe(false)
	})
})
