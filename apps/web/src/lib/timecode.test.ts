import { describe, expect, it } from "vitest"
import {
	formatPlayhead,
	frameAt,
	frameMidpoint,
	framesToTimecode,
	lastFrameOf,
	nextTimeDisplayMode,
	secondsToTimecode,
	timecodeBase,
	timecodeToFrames,
	videoTimingFor,
} from "./timecode"

describe("timecode", () => {
	it("matches the API's drop-frame numbering at the minute and ten-minute marks", () => {
		const base = timecodeBase(30000 / 1001)
		expect(framesToTimecode(1799, base)).toBe("00:00:59;29")
		expect(framesToTimecode(1800, base)).toBe("00:01:00;02")
		expect(framesToTimecode(17982, base)).toBe("00:10:00;00")
		expect(framesToTimecode(107892, base)).toBe("01:00:00;00")
	})

	it("round-trips timecode and frame counts", () => {
		for (const rate of [23.976, 24, 25, 29.97, 50, 59.94]) {
			const base = timecodeBase(rate)
			for (const frames of [0, 7, 1799, 1800, 17982, 86399]) {
				expect(timecodeToFrames(framesToTimecode(frames, base), base)).toBe(frames)
			}
		}
	})

	it("offsets the playhead by the camera's start timecode", () => {
		const timing = videoTimingFor(25, "10:00:00:00")
		expect(secondsToTimecode(2.2, timing)).toBe("10:00:02:05")
	})
})

describe("frame stepping", () => {
	it("seeks to the middle of a frame so the decoder shows that frame and no other", () => {
		const base = timecodeBase(24)
		for (const frame of [0, 1, 23, 24, 1000]) {
			expect(frameAt(frameMidpoint(frame, base), base)).toBe(frame)
		}
	})

	it("knows the final frame of a clip", () => {
		const base = timecodeBase(24)
		expect(lastFrameOf(1, base)).toBe(23)
		expect(lastFrameOf(1.01, base)).toBe(24)
	})
})

describe("formatPlayhead", () => {
	const timing = videoTimingFor(24, null)

	it("shows the time in whichever unit the reviewer chose", () => {
		expect(formatPlayhead(61.5, "timecode", timing)).toBe("00:01:01:12")
		expect(formatPlayhead(61.5, "frames", timing)).toBe("1476f")
		expect(formatPlayhead(61.5, "seconds", timing)).toBe("1:01")
		expect(formatPlayhead(61.5, "seconds", timing, true)).toBe("1:01.5")
	})

	it("cycles through every display mode", () => {
		expect(nextTimeDisplayMode("timecode")).toBe("seconds")
		expect(nextTimeDisplayMode("seconds")).toBe("frames")
		expect(nextTimeDisplayMode("frames")).toBe("timecode")
	})
})
