import { describe, expect, it } from "vitest"
import { AI_ANNOTATION_COLOR, annotationsFor } from "./comments.js"
import { previewCandidates } from "./media.js"
import { ToolInputError } from "../tool-kit.js"

describe("annotationsFor", () => {
	it("turns a region into a rectangle in the viewer's normalised coordinates", () => {
		expect(annotationsFor({ region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }, 1000)).toEqual([
			{
				id: 1000,
				type: "rect",
				color: AI_ANNOTATION_COLOR,
				points: [
					{ x: 0.1, y: 0.2 },
					{ x: 0.4, y: expect.closeTo(0.6, 10) },
				],
			},
		])
	})

	it("stamps the video time range and PDF page on every drawing", () => {
		const [annotation] =
			annotationsFor({
				shapes: [{ type: "line", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
				timestamp: 12.5,
				timestampEnd: 14,
				page: 3,
			}) ?? []
		expect(annotation).toMatchObject({ t: 12.5, tEnd: 14, page: 3 })
	})

	it("refuses a region that runs off the media", () => {
		expect(() => annotationsFor({ region: { x: 0.8, y: 0, width: 0.5, height: 0.1 } })).toThrow(ToolInputError)
	})

	it("returns nothing when no drawing was asked for", () => {
		expect(annotationsFor({ timestamp: 3 })).toBeNull()
	})
})

describe("previewCandidates", () => {
	it("prefers the browser-safe rendition of an image, then the original", () => {
		expect(
			previewCandidates({ mediaType: "IMAGE", url: "/uploads/a.tiff", proxyUrl: "/uploads/a.png", thumbnailUrl: null })
		).toEqual(["/uploads/a.png", "/uploads/a.tiff"])
	})

	it("uses the poster frame for videos, never the video file", () => {
		expect(
			previewCandidates({ mediaType: "VIDEO", url: "/uploads/v.mp4", proxyUrl: "/uploads/p.mp4", thumbnailUrl: "/uploads/t.jpg" })
		).toEqual(["/uploads/t.jpg"])
	})
})
