import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: { imageVersion: { findUnique: vi.fn() } },
}))

import { prisma } from "../../lib/prisma"
import { timecodeBase } from "../../lib/timecode"
import {
	VersionMarkers,
	buildVersionMarkers,
	renderFcp7Xml,
	renderResolveEdl,
	timelineStartFrames,
} from "./markers.service"

const mockedFind = vi.mocked(prisma.imageVersion.findUnique)

const storedVersion = (overrides: Record<string, unknown> = {}) => ({
	mediaType: "VIDEO",
	versionName: "Cut 2",
	frameRate: 24,
	duration: 10,
	startTimecode: null,
	image: { name: "Hero spot" },
	comments: [
		{
			content: "Logo too\nsmall | bump it",
			resolved: false,
			timestamp: 1.5,
			timestampEnd: null,
			user: { name: "Ada", email: "ada@example.com" },
		},
		{
			content: "Colour shift",
			resolved: true,
			timestamp: 4,
			timestampEnd: 6,
			user: { name: null, email: "bo@example.com" },
		},
	],
	...overrides,
})

const markersAt = (overrides: Partial<VersionMarkers> = {}): VersionMarkers => ({
	imageName: "Hero spot",
	versionName: "Cut 2",
	base: timecodeBase(24),
	startTimecode: null,
	durationFrames: 240,
	markers: [
		{ frame: 36, durationFrames: 1, author: "Ada", note: "Logo too small | bump it", resolved: false },
		{ frame: 96, durationFrames: 48, author: "bo@example.com", note: "[resolved] Colour shift", resolved: true },
	],
	...overrides,
})

beforeEach(() => vi.clearAllMocks())

describe("buildVersionMarkers", () => {
	it("turns timestamped comments into frame-accurate markers", async () => {
		mockedFind.mockResolvedValue(storedVersion() as never)

		const result = await buildVersionMarkers("v1", false)

		expect(result?.markers).toEqual([
			{ frame: 36, durationFrames: 1, author: "Ada", note: "Logo too small | bump it", resolved: false },
			{ frame: 96, durationFrames: 48, author: "bo@example.com", note: "[resolved] Colour shift", resolved: true },
		])
		expect(result?.durationFrames).toBe(240)
	})

	it("leaves internal notes out for people who may not see them", async () => {
		mockedFind.mockResolvedValue(storedVersion() as never)

		await buildVersionMarkers("v1", false)

		expect(mockedFind.mock.calls[0][0]).toMatchObject({
			select: { comments: { where: { internal: false } } },
		})
	})

	it("includes internal notes for the team", async () => {
		mockedFind.mockResolvedValue(storedVersion() as never)

		await buildVersionMarkers("v1", true)

		const where = (mockedFind.mock.calls[0][0] as { select: { comments: { where: object } } })
			.select.comments.where
		expect(where).not.toHaveProperty("internal")
	})

	it("refuses versions that are not video", async () => {
		mockedFind.mockResolvedValue(storedVersion({ mediaType: "IMAGE" }) as never)

		await expect(buildVersionMarkers("v1", true)).rejects.toThrow(/video/)
	})
})

describe("timelineStartFrames", () => {
	it("places markers on a one-hour timeline unless the camera recorded its own timecode", () => {
		expect(timelineStartFrames(markersAt(), null)).toBe(24 * 3600)
		expect(
			timelineStartFrames(markersAt({ startTimecode: "10:00:00:00" }), null)
		).toBe(24 * 36000)
	})

	it("falls back to one hour when the recorded timecode does not fit the frame rate", () => {
		expect(timelineStartFrames(markersAt({ startTimecode: "10:00:00:29" }), null)).toBe(24 * 3600)
	})

	it("honours an explicit timeline start", () => {
		expect(timelineStartFrames(markersAt(), "00:00:00:00")).toBe(0)
	})
})

describe("renderResolveEdl", () => {
	it("writes one marker event per comment in DaVinci Resolve's marker EDL form", () => {
		const edl = renderResolveEdl(markersAt(), 24 * 3600)
		const lines = edl.split("\r\n")

		expect(lines[0]).toBe("TITLE: Hero spot - Cut 2")
		expect(lines[1]).toBe("FCM: NON-DROP FRAME")
		expect(lines[3]).toBe(
			"001  001      V     C        01:00:01:12 01:00:01:13 01:00:01:12 01:00:01:13  "
		)
		expect(lines[4]).toBe("Logo too small / bump it |C:ResolveColorBlue |M:Ada |D:1")
		expect(lines[7]).toBe(
			"[resolved] Colour shift |C:ResolveColorGreen |M:bo@example.com |D:48"
		)
	})

	it("declares drop-frame for 29.97 footage", () => {
		const edl = renderResolveEdl(
			markersAt({ base: timecodeBase(30000 / 1001), markers: [] }),
			0
		)
		expect(edl).toContain("FCM: DROP FRAME")
	})
})

describe("renderFcp7Xml", () => {
	it("writes sequence markers Premiere Pro can import", () => {
		const xml = renderFcp7Xml(markersAt(), 24 * 3600)

		expect(xml).toContain("<string>01:00:00:00</string>")
		expect(xml).toContain("<in>36</in>")
		expect(xml).toContain("<out>-1</out>")
		expect(xml).toContain("<in>96</in>")
		expect(xml).toContain("<out>144</out>")
	})

	it("escapes comment text so a note cannot break the document", () => {
		const xml = renderFcp7Xml(
			markersAt({
				markers: [
					{ frame: 0, durationFrames: 1, author: "<b>", note: `a & "b" </comment>`, resolved: false },
				],
			}),
			0
		)

		expect(xml).toContain("<comment>a &amp; &quot;b&quot; &lt;/comment&gt;</comment>")
		expect(xml).toContain("<name>&lt;b&gt;</name>")
	})
})
