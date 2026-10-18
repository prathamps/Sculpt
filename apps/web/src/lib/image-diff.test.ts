import { describe, expect, it } from "vitest"
import { analysisSize, changedRegions, diffMask } from "./image-diff"

const solid = (width: number, height: number, value: number): Uint8ClampedArray => {
	const pixels = new Uint8ClampedArray(width * height * 4)
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i] = value
		pixels[i + 1] = value
		pixels[i + 2] = value
		pixels[i + 3] = 255
	}
	return pixels
}

const paint = (
	pixels: Uint8ClampedArray,
	width: number,
	box: { x: number; y: number; w: number; h: number },
	value: number
) => {
	for (let y = box.y; y < box.y + box.h; y++) {
		for (let x = box.x; x < box.x + box.w; x++) {
			const offset = (y * width + x) * 4
			pixels[offset] = value
			pixels[offset + 1] = value
			pixels[offset + 2] = value
		}
	}
}

describe("diffMask", () => {
	it("ignores compression noise below the threshold", () => {
		const mask = diffMask(solid(4, 4, 100), solid(4, 4, 108), 4, 4)
		expect(Array.from(mask).every((value) => value === 0)).toBe(true)
	})

	it("marks pixels that really changed", () => {
		const after = solid(4, 4, 100)
		paint(after, 4, { x: 1, y: 1, w: 2, h: 1 }, 250)
		const mask = diffMask(solid(4, 4, 100), after, 4, 4)
		expect(Array.from(mask)).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
	})
})

describe("changedRegions", () => {
	it("finds each separate change as its own region", () => {
		const width = 128
		const height = 64
		const after = solid(width, height, 0)
		paint(after, width, { x: 0, y: 0, w: 16, h: 16 }, 255)
		paint(after, width, { x: 96, y: 32, w: 32, h: 32 }, 255)

		const regions = changedRegions(diffMask(solid(width, height, 0), after, width, height), width, height)

		expect(regions).toHaveLength(2)
		expect(regions[0]).toEqual({ x: 0.75, y: 0.5, width: 0.25, height: 0.5 })
		expect(regions[1]).toEqual({ x: 0, y: 0, width: 0.125, height: 0.25 })
	})

	it("merges touching changes into one region", () => {
		const width = 64
		const height = 64
		const after = solid(width, height, 0)
		paint(after, width, { x: 0, y: 0, w: 40, h: 8 }, 255)

		const regions = changedRegions(diffMask(solid(width, height, 0), after, width, height), width, height)

		expect(regions).toHaveLength(1)
		expect(regions[0]?.width).toBeCloseTo(0.75)
	})

	it("reports nothing for identical images", () => {
		expect(changedRegions(new Uint8Array(64 * 64), 64, 64)).toEqual([])
	})
})

describe("analysisSize", () => {
	it("shrinks large images for analysis but never enlarges small ones", () => {
		expect(analysisSize(4000, 2000)).toEqual({ width: 768, height: 384 })
		expect(analysisSize(300, 200)).toEqual({ width: 300, height: 200 })
	})
})
