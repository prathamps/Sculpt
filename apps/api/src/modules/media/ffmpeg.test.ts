import { describe, expect, it } from "vitest"
import { parseFrameRate } from "./ffmpeg"

describe("parseFrameRate", () => {
	it("reads the rational form ffprobe reports", () => {
		expect(parseFrameRate("24/1")).toBe(24)
		expect(parseFrameRate("25/1")).toBe(25)
	})

	it("resolves NTSC rates that are not whole numbers", () => {
		expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 2)
		expect(parseFrameRate("24000/1001")).toBeCloseTo(23.976, 3)
		expect(parseFrameRate("60000/1001")).toBeCloseTo(59.94, 2)
	})

	it("accepts a bare number", () => {
		expect(parseFrameRate("48")).toBe(48)
	})

	it("tolerates surrounding whitespace from the probe output", () => {
		expect(parseFrameRate("  25/1\n")).toBe(25)
	})

	it("returns null for a stream with no frame rate", () => {
		expect(parseFrameRate("0/0")).toBeNull()
		expect(parseFrameRate("0/1")).toBeNull()
	})

	it("returns null for unparseable output rather than guessing", () => {
		expect(parseFrameRate("N/A")).toBeNull()
		expect(parseFrameRate("")).toBeNull()
	})

	it("rejects implausible rates so a corrupt probe cannot break stepping", () => {
		expect(parseFrameRate("100000/1")).toBeNull()
	})
})
