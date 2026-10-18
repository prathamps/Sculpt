import { describe, expect, it } from "vitest"
import { chooseVideoSource, prefersLightRendition } from "./video-quality"

const desktop = { narrowScreen: false, saveData: false, effectiveType: "4g" }
const phone = { narrowScreen: true, saveData: false, effectiveType: "4g" }
const sources = { full: "/full.mp4", low: "/low.mp4" }

describe("prefersLightRendition", () => {
	it("prefers the lighter rendition on phones, data saver and slow networks", () => {
		expect(prefersLightRendition(phone)).toBe(true)
		expect(prefersLightRendition({ ...desktop, saveData: true })).toBe(true)
		expect(prefersLightRendition({ ...desktop, effectiveType: "3g" })).toBe(true)
		expect(prefersLightRendition(desktop)).toBe(false)
		expect(prefersLightRendition({ ...desktop, effectiveType: null })).toBe(false)
	})
})

describe("chooseVideoSource", () => {
	it("lets Auto follow the device", () => {
		expect(chooseVideoSource("auto", sources, prefersLightRendition(phone))).toBe("/low.mp4")
		expect(chooseVideoSource("auto", sources, prefersLightRendition(desktop))).toBe("/full.mp4")
	})

	it("honours an explicit choice whatever the device", () => {
		expect(chooseVideoSource("high", sources, true)).toBe("/full.mp4")
		expect(chooseVideoSource("low", sources, false)).toBe("/low.mp4")
	})

	it("plays the only rendition there is when the source was already small", () => {
		expect(chooseVideoSource("low", { full: "/full.mp4", low: null }, true)).toBe("/full.mp4")
	})
})
