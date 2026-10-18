import { describe, expect, it } from "vitest"
import { RevisionCheckItem } from "@/types"
import { carriedAnnotationsFor, carriedModelPinFor } from "./viewer-overlays"
import { mayConfirmFix, mayUndoCheck } from "@/components/RevisionCheckPanel"

const ada = { id: "ada", name: "Ada", email: "ada@example.com" }
const bo = { id: "bo", name: null, email: "bo@example.com" }

const item = (overrides: Partial<RevisionCheckItem> = {}): RevisionCheckItem => ({
	commentId: "c1",
	content: "Logo too small",
	author: ada,
	createdAt: "2026-10-01T00:00:00.000Z",
	internal: false,
	resolved: false,
	fromVersion: { id: "v1", versionName: "Version 1", versionNumber: 1 },
	timestamp: null,
	timestampEnd: null,
	page: null,
	modelAnchor: null,
	annotation: [{ id: 1, type: "rect", color: "#f00", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
	check: null,
	stillOpenOn: null,
	...overrides,
})

const still = { isVideo: false, isPdf: false, currentPdfPage: 1 }

describe("carriedAnnotationsFor", () => {
	it("shows the earlier drawing highlighted on the new version", () => {
		const [annotation] = carriedAnnotationsFor(item(), still)
		expect(annotation).toMatchObject({ type: "rect", isHighlighted: true })
	})

	it("pins the drawing to the original moment on video", () => {
		const [annotation] = carriedAnnotationsFor(item({ timestamp: 4, timestampEnd: 6 }), {
			...still,
			isVideo: true,
		})
		expect(annotation).toMatchObject({ t: 4, tEnd: 6, pinned: true })
	})

	it("only shows a PDF drawing on the page it was made on", () => {
		expect(carriedAnnotationsFor(item({ page: 2 }), { ...still, isPdf: true, currentPdfPage: 1 })).toEqual([])
		expect(carriedAnnotationsFor(item({ page: 2 }), { ...still, isPdf: true, currentPdfPage: 2 })).toHaveLength(1)
	})

	it("draws nothing when no earlier feedback is focused", () => {
		expect(carriedAnnotationsFor(null, still)).toEqual([])
	})
})

describe("carriedModelPinFor", () => {
	it("marks the earlier pin with the version it came from", () => {
		const anchor = { position: [0, 1, 0] as [number, number, number] }
		expect(carriedModelPinFor(item({ modelAnchor: anchor }))).toMatchObject({
			commentId: "carried:c1",
			badge: "V1",
			anchor,
			selected: true,
		})
		expect(carriedModelPinFor(item())).toBeNull()
	})
})

describe("revision check permissions", () => {
	it("lets the author or an editor confirm a fix", () => {
		expect(mayConfirmFix(item(), "ada", false)).toBe(true)
		expect(mayConfirmFix(item(), "bo", false)).toBe(false)
		expect(mayConfirmFix(item(), "bo", true)).toBe(true)
	})

	it("lets whoever checked it, or an editor, undo a check", () => {
		const checked = item({
			check: { status: "NOT_FIXED", checkedBy: bo, checkedAt: "2026-10-02T00:00:00.000Z" },
		})
		expect(mayUndoCheck(checked, "bo", false)).toBe(true)
		expect(mayUndoCheck(checked, "ada", false)).toBe(false)
		expect(mayUndoCheck(checked, "ada", true)).toBe(true)
		expect(mayUndoCheck(item(), "ada", true)).toBe(false)
	})
})
