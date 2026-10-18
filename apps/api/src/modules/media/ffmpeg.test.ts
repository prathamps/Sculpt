import { describe, expect, it } from "vitest"
import {
	FULL_RENDITION,
	LOW_RENDITION,
	exceedsRendition,
	parseFrameRate,
	parseTimecode,
	parseVideoDetails,
	renditionArgs,
} from "./ffmpeg"

const probeJson = (value: unknown): string => JSON.stringify(value)

describe("parseVideoDetails", () => {
	it("reads frame rate and size from the first video stream", () => {
		const details = parseVideoDetails(
			probeJson({
				streams: [
					{ codec_type: "audio" },
					{ codec_type: "video", avg_frame_rate: "24000/1001", width: 3840, height: 2160 },
				],
			})
		)
		expect(details.frameRate).toBeCloseTo(23.976, 3)
		expect(details.frameRateExpression).toBe("24000/1001")
		expect(details.width).toBe(3840)
		expect(details.height).toBe(2160)
	})

	it("finds a camera's start timecode on a QuickTime timecode track", () => {
		const details = parseVideoDetails(
			probeJson({
				streams: [
					{ codec_type: "video", avg_frame_rate: "25/1", width: 1920, height: 1080 },
					{ codec_type: "data", tags: { timecode: "10:00:00:00" } },
				],
			})
		)
		expect(details.startTimecode).toBe("10:00:00:00")
	})

	it("drops a recorded timecode whose frame number cannot exist at the probed rate", () => {
		const details = parseVideoDetails(
			probeJson({
				streams: [{ codec_type: "video", avg_frame_rate: "25/1", tags: { timecode: "01:00:00:29" } }],
			})
		)
		expect(details.startTimecode).toBeNull()
	})

	it("prefers the container's timecode over a stream's", () => {
		const details = parseVideoDetails(
			probeJson({
				streams: [{ codec_type: "video", tags: { timecode: "02:00:00:00" } }],
				format: { tags: { timecode: "01:00:00;00" } },
			})
		)
		expect(details.startTimecode).toBe("01:00:00;00")
	})

	it("reports nothing rather than guessing when the probe output is unusable", () => {
		expect(parseVideoDetails("not json")).toEqual({
			frameRate: null,
			frameRateExpression: null,
			width: null,
			height: null,
			startTimecode: null,
		})
	})

	it("leaves the frame rate expression out when the rate is implausible", () => {
		const details = parseVideoDetails(
			probeJson({ streams: [{ codec_type: "video", avg_frame_rate: "0/0" }] })
		)
		expect(details.frameRate).toBeNull()
		expect(details.frameRateExpression).toBeNull()
	})
})

describe("parseTimecode", () => {
	it("accepts non-drop and drop-frame SMPTE timecode", () => {
		expect(parseTimecode("01:00:00:00")).toBe("01:00:00:00")
		expect(parseTimecode(" 00:59:59;29 ")).toBe("00:59:59;29")
	})

	it("rejects anything that is not a timecode so it never reaches the player", () => {
		expect(parseTimecode("1:00:00:00")).toBeNull()
		expect(parseTimecode("01:61:00:00")).toBeNull()
		expect(parseTimecode("<script>")).toBeNull()
		expect(parseTimecode(undefined)).toBeNull()
	})
})

describe("web renditions", () => {
	it("needs a lighter rendition only when the source is larger than it", () => {
		expect(exceedsRendition({ width: 1920, height: 1080 }, LOW_RENDITION)).toBe(true)
		expect(exceedsRendition({ width: 640, height: 360 }, LOW_RENDITION)).toBe(false)
		expect(exceedsRendition({ width: 540, height: 960 }, LOW_RENDITION)).toBe(true)
		expect(exceedsRendition({ width: null, height: null }, LOW_RENDITION)).toBe(false)
	})

	it("encodes at a constant frame rate matching the source so frame stepping lands on real frames", () => {
		const args = renditionArgs({ ...FULL_RENDITION, outputPath: "out.mp4" }, "30000/1001")
		expect(args).toEqual(expect.arrayContaining(["-fps_mode", "cfr"]))
		expect(args[args.indexOf("-r") + 1]).toBe("30000/1001")
	})

	it("never enlarges a source smaller than the rendition", () => {
		const args = renditionArgs({ ...FULL_RENDITION, outputPath: "out.mp4" }, null)
		expect(args[args.indexOf("-vf") + 1]).toContain("w='min(iw,1920)':h='min(ih,1080)'")
	})

	it("places a keyframe every second so scrubbing seeks quickly", () => {
		const args = renditionArgs({ ...LOW_RENDITION, outputPath: "low.mp4" }, null)
		expect(args[args.indexOf("-force_key_frames") + 1]).toBe("expr:gte(t,n_forced*1)")
		expect(args).not.toContain("-r")
		expect(args[args.length - 1]).toBe("low.mp4")
	})
})

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
