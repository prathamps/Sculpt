import { describe, expect, it } from "vitest"
import { parseFilesMeta } from "./upload-meta"
import { ValidationError } from "../../lib/errors"

const noCompanions = { thumbnails: 0, modelProxies: 0 }

describe("parseFilesMeta", () => {
	it("falls back to the legacy shared duration when filesMeta is absent", () => {
		expect(parseFilesMeta(undefined, 2, noCompanions, 8.5)).toEqual([
			{ duration: 8.5, hasThumbnail: false, hasModelProxy: false },
			{ duration: 8.5, hasThumbnail: false, hasModelProxy: false },
		])
	})

	it("rejects thumbnails without filesMeta", () => {
		expect(() =>
			parseFilesMeta(undefined, 1, { thumbnails: 1, modelProxies: 0 }, null)
		).toThrow(ValidationError)
	})

	it("rejects converted models without filesMeta", () => {
		expect(() =>
			parseFilesMeta(undefined, 1, { thumbnails: 0, modelProxies: 1 }, null)
		).toThrow(ValidationError)
	})

	it("rejects malformed JSON and length mismatches", () => {
		expect(() => parseFilesMeta("not json", 1, noCompanions, null)).toThrow(
			ValidationError
		)
		expect(() => parseFilesMeta("[{}]", 2, noCompanions, null)).toThrow(
			ValidationError
		)
	})

	it("pairs thumbnails only with flagged entries", () => {
		const metas = parseFilesMeta(
			JSON.stringify([
				{ duration: 3.2, hasThumbnail: true },
				{ duration: null, hasThumbnail: false },
			]),
			2,
			{ thumbnails: 1, modelProxies: 0 },
			null
		)
		expect(metas).toEqual([
			{ duration: 3.2, hasThumbnail: true, hasModelProxy: false },
			{ duration: null, hasThumbnail: false, hasModelProxy: false },
		])
	})

	it("pairs converted models independently of thumbnails", () => {
		const metas = parseFilesMeta(
			JSON.stringify([
				{ hasThumbnail: true, hasModelProxy: true },
				{ hasThumbnail: true, hasModelProxy: false },
			]),
			2,
			{ thumbnails: 2, modelProxies: 1 },
			null
		)
		expect(metas.map((m) => m.hasModelProxy)).toEqual([true, false])
	})

	it("rejects a thumbnail count that does not match the flags", () => {
		expect(() =>
			parseFilesMeta(
				JSON.stringify([{ hasThumbnail: true }, { hasThumbnail: true }]),
				2,
				{ thumbnails: 1, modelProxies: 0 },
				null
			)
		).toThrow(ValidationError)
	})

	it("rejects a converted model count that does not match the flags", () => {
		expect(() =>
			parseFilesMeta(
				JSON.stringify([{ hasModelProxy: true }, { hasModelProxy: true }]),
				2,
				{ thumbnails: 0, modelProxies: 1 },
				null
			)
		).toThrow(ValidationError)
	})

	it("sanitizes invalid durations to null", () => {
		const metas = parseFilesMeta(
			JSON.stringify([{ duration: -4 }, { duration: "9" }]),
			2,
			noCompanions,
			null
		)
		expect(metas.map((m) => m.duration)).toEqual([null, null])
	})
})
