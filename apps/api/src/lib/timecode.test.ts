import { describe, expect, it } from "vitest"
import {
	frameAt,
	framesToTimecode,
	secondsToTimecode,
	timecodeBase,
	timecodeToFrames,
} from "./timecode"

describe("timecodeBase", () => {
	it("treats 29.97 and 59.94 as drop-frame and everything else as non-drop", () => {
		expect(timecodeBase(30000 / 1001)).toMatchObject({ nominalRate: 30, dropFrame: true })
		expect(timecodeBase(60000 / 1001)).toMatchObject({ nominalRate: 60, dropFrame: true })
		expect(timecodeBase(24000 / 1001)).toMatchObject({ nominalRate: 24, dropFrame: false })
		expect(timecodeBase(25)).toMatchObject({ nominalRate: 25, dropFrame: false })
	})

	it("falls back to 30 fps when the frame rate was never probed", () => {
		expect(timecodeBase(null)).toMatchObject({ frameRate: 30, nominalRate: 30 })
	})
})

describe("framesToTimecode", () => {
	it("counts whole frames at integer rates", () => {
		const base = timecodeBase(25)
		expect(framesToTimecode(0, base)).toBe("00:00:00:00")
		expect(framesToTimecode(24, base)).toBe("00:00:00:24")
		expect(framesToTimecode(25 * 3661 + 7, base)).toBe("01:01:01:07")
	})

	it("skips frame numbers 00 and 01 at each minute except every tenth in drop-frame", () => {
		const base = timecodeBase(30000 / 1001)
		expect(framesToTimecode(1799, base)).toBe("00:00:59;29")
		expect(framesToTimecode(1800, base)).toBe("00:01:00;02")
		expect(framesToTimecode(17982, base)).toBe("00:10:00;00")
	})

	it("matches wall-clock time after an hour of 29.97 footage", () => {
		const base = timecodeBase(30000 / 1001)
		expect(framesToTimecode(107892, base)).toBe("01:00:00;00")
	})
})

describe("timecodeToFrames", () => {
	it("is the inverse of framesToTimecode", () => {
		for (const rate of [24, 25, 30000 / 1001, 60000 / 1001]) {
			const base = timecodeBase(rate)
			for (const frames of [0, 1, 1799, 1800, 17982, 107892, 123456]) {
				expect(timecodeToFrames(framesToTimecode(frames, base), base)).toBe(frames)
			}
		}
	})

	it("rejects malformed or out-of-range timecode", () => {
		const base = timecodeBase(25)
		expect(timecodeToFrames("1:00:00:00", base)).toBeNull()
		expect(timecodeToFrames("00:00:00:25", base)).toBeNull()
		expect(timecodeToFrames("00:61:00:00", base)).toBeNull()
	})
})

describe("secondsToTimecode", () => {
	it("offsets by the camera's start timecode", () => {
		const base = timecodeBase(24)
		expect(secondsToTimecode(1.5, base, "10:00:00:00")).toBe("10:00:01:12")
	})

	it("does not round a time sitting exactly on a frame boundary down to the previous frame", () => {
		const base = timecodeBase(30000 / 1001)
		expect(frameAt(1001 / 30000 * 3, base)).toBe(3)
	})
})
