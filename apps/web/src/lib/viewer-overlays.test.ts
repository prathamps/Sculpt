import { describe, expect, it } from "vitest"
import { Annotation, Comment } from "@/types"
import {
	CanvasAnnotationInput,
	canvasAnnotationsFor,
	modelPinsFor,
	timelineMarkersFor,
	viewingPeopleFor,
} from "./viewer-overlays"

const stroke = (id: number): Annotation => ({
	id,
	type: "pencil",
	color: "#000",
	points: [],
})

const comment = (id: string, overrides: Partial<Comment> = {}): Comment =>
	({
		id,
		content: id,
		imageVersionId: "v1",
		userId: "u1",
		user: { id: "u1", email: "ada@example.com", name: "Ada" },
		resolved: false,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	}) as Comment

const baseInput: CanvasAnnotationInput = {
	drafts: [],
	comments: [],
	selectedComment: null,
	selectedCommentId: null,
	isVideo: false,
	isPdf: false,
	currentPdfPage: 1,
	showAllAnnotations: false,
}

describe("canvasAnnotationsFor", () => {
	it("shows only the drafts on a still image until a comment is selected", () => {
		const result = canvasAnnotationsFor({
			...baseInput,
			drafts: [stroke(1)],
			comments: [comment("c1", { annotation: stroke(2) })],
		})

		expect(result.map((annotation) => annotation.id)).toEqual([1])
	})

	it("highlights the selected comment's drawing", () => {
		const selected = comment("c1", { annotation: [stroke(2), stroke(3)] })
		const result = canvasAnnotationsFor({
			...baseInput,
			comments: [selected],
			selectedComment: selected,
			selectedCommentId: "c1",
		})

		expect(result).toHaveLength(2)
		expect(result.every((annotation) => annotation.isHighlighted)).toBe(true)
	})

	it("limits PDF drawings to the page being viewed", () => {
		const result = canvasAnnotationsFor({
			...baseInput,
			isPdf: true,
			currentPdfPage: 2,
			showAllAnnotations: true,
			comments: [
				comment("p1", { page: 1, annotation: stroke(1) }),
				comment("p2", { page: 2, annotation: stroke(2) }),
			],
		})

		expect(result.map((annotation) => annotation.id)).toEqual([2])
	})

	it("anchors video drawings to their comment's time range", () => {
		const result = canvasAnnotationsFor({
			...baseInput,
			isVideo: true,
			comments: [
				comment("c1", { timestamp: 4, timestampEnd: 6, annotation: stroke(1) }),
			],
		})

		expect(result[0]).toMatchObject({ t: 4, tEnd: 6 })
	})
})

describe("timelineMarkersFor", () => {
	it("places a marker only for timed comments", () => {
		const markers = timelineMarkersFor(
			[comment("timed", { timestamp: 3 }), comment("untimed")],
			"timed"
		)

		expect(markers).toEqual([
			expect.objectContaining({
				commentId: "timed",
				t: 3,
				initial: "A",
				selected: true,
			}),
		])
	})
})

describe("modelPinsFor", () => {
	it("numbers pins in the order they were placed", () => {
		const anchor = { position: [0, 0, 0] as [number, number, number] }
		const pins = modelPinsFor(
			[
				comment("later", {
					modelAnchor: anchor,
					createdAt: "2026-01-02T00:00:00.000Z",
				}),
				comment("earlier", { modelAnchor: anchor }),
			],
			null
		)

		expect(pins.map((pin) => [pin.commentId, pin.number])).toEqual([
			["earlier", 1],
			["later", 2],
		])
	})
})

describe("viewingPeopleFor", () => {
	it("lists each person once even with several tabs open", () => {
		const people = viewingPeopleFor([
			{ socketId: "s1", user: { id: "u1", name: "Ada" }, time: 0 },
			{ socketId: "s2", user: { id: "u1", name: "Ada" }, time: 5 },
			{ socketId: "s3", user: { id: "u2", name: null }, time: 0 },
		])

		expect(people).toEqual([
			{ name: "Ada", avatarUrl: null },
			{ name: "Someone", avatarUrl: null },
		])
	})
})
