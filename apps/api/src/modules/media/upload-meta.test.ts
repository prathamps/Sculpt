import { describe, expect, it } from "vitest"
import { parseFilesMeta } from "./upload-meta"
import { ValidationError } from "../../lib/errors"

describe("parseFilesMeta", () => {
	it("falls back to the legacy shared duration when filesMeta is absent", () => {
		expect(parseFilesMeta(undefined, 2, 0, 8.5)).toEqual([
			{ duration: 8.5, hasThumbnail: false },
			{ duration: 8.5, hasThumbnail: false },
		])
	})

	it("rejects thumbnails without filesMeta", () => {
		expect(() => parseFilesMeta(undefined, 1, 1, null)).toThrow(
			ValidationError
		)
	})

	it("rejects malformed JSON and length mismatches", () => {
		expect(() => parseFilesMeta("not json", 1, 0, null)).toThrow(
			ValidationError
		)
		expect(() => parseFilesMeta("[{}]", 2, 0, null)).toThrow(ValidationError)
	})

	it("pairs thumbnails only with flagged entries", () => {
		const metas = parseFilesMeta(
			JSON.stringify([
				{ duration: 3.2, hasThumbnail: true },
				{ duration: null, hasThumbnail: false },
			]),
			2,
			1,
			null
		)
		expect(metas).toEqual([
			{ duration: 3.2, hasThumbnail: true },
			{ duration: null, hasThumbnail: false },
		])
	})

	it("rejects a thumbnail count that does not match the flags", () => {
		expect(() =>
			parseFilesMeta(
				JSON.stringify([{ hasThumbnail: true }, { hasThumbnail: true }]),
				2,
				1,
				null
			)
		).toThrow(ValidationError)
	})

	it("sanitizes invalid durations to null", () => {
		const metas = parseFilesMeta(
			JSON.stringify([{ duration: -4 }, { duration: "9" }]),
			2,
			0,
			null
		)
		expect(metas.map((m) => m.duration)).toEqual([null, null])
	})
})
