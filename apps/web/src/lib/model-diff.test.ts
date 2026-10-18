import { describe, expect, it } from "vitest"
import * as THREE from "three"
import {
	boundsDiagonal,
	deviationColor,
	faceDeviation,
	measureDeviation,
	summariseDeviation,
	worldSpaceGeometry,
} from "./model-diff"

const immediately = async () => undefined

const box = (size: number, x = 0) => {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size))
	mesh.position.x = x
	const root = new THREE.Group()
	root.add(mesh)
	return root
}

describe("worldSpaceGeometry", () => {
	it("bakes every mesh's transform into one geometry", () => {
		const root = new THREE.Group()
		const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
		const right = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
		right.position.x = 10
		root.add(left, right)

		const geometry = worldSpaceGeometry(root)

		expect(geometry.getAttribute("position").count).toBe(48)
		expect(geometry.getIndex()?.count).toBe(72)
		expect(geometry.boundingBox?.max.x).toBeCloseTo(10.5)
	})
})

describe("measureDeviation", () => {
	it("finds no deviation between identical models", async () => {
		const field = await measureDeviation(worldSpaceGeometry(box(2)), worldSpaceGeometry(box(2)), {
			yieldToBrowser: immediately,
		})
		expect(field?.max).toBeCloseTo(0, 5)
	})

	it("measures how far a revised surface moved", async () => {
		const field = await measureDeviation(worldSpaceGeometry(box(2)), worldSpaceGeometry(box(2.5)), {
			yieldToBrowser: immediately,
		})
		expect(field?.max).toBeCloseTo(Math.sqrt(3 * 0.25 ** 2), 3)
		expect(field?.mean).toBeGreaterThan(0)
	})

	it("works through large models in slices and reports progress", async () => {
		const progress: number[] = []
		await measureDeviation(worldSpaceGeometry(box(2)), worldSpaceGeometry(box(2)), {
			chunk: 5,
			onProgress: (fraction) => progress.push(fraction),
			yieldToBrowser: immediately,
		})
		expect(progress.length).toBeGreaterThan(1)
		expect(progress.at(-1)).toBe(1)
	})

	it("stops when the comparison is abandoned", async () => {
		const field = await measureDeviation(worldSpaceGeometry(box(2)), worldSpaceGeometry(box(3)), {
			chunk: 5,
			isCancelled: () => true,
			yieldToBrowser: immediately,
		})
		expect(field).toBeNull()
	})
})

describe("deviation colours and summary", () => {
	const field = { distances: new Float32Array([0, 0.001, 0.5, 1]), max: 1, mean: 0.37 }

	it("keeps changes within tolerance neutral and ramps larger ones toward red", () => {
		const neutral = deviationColor(0.001, 0.01, 1)
		const small = deviationColor(0.02, 0.01, 1)
		const large = deviationColor(1, 0.01, 1)
		expect(neutral).toEqual(deviationColor(0, 0.01, 1))
		expect(small[1]).toBeGreaterThan(large[1])
		expect(large[0]).toBeGreaterThan(0.8)
	})

	it("reports the share of the surface that moved beyond tolerance", () => {
		expect(summariseDeviation(field, 0.01)).toEqual({ changedShare: 0.5, max: 1, mean: 0.37 })
	})

	it("averages the deviation of a face's corners", () => {
		expect(faceDeviation(field, [2, 3])).toBeCloseTo(0.75)
	})
})

describe("boundsDiagonal", () => {
	it("spans both models so tolerance scales with the whole comparison", () => {
		expect(boundsDiagonal(worldSpaceGeometry(box(2)), worldSpaceGeometry(box(2, 4)))).toBeCloseTo(
			Math.hypot(6, 2, 2),
			5
		)
	})
})
