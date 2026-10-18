import { describe, expect, it } from "vitest"
import * as THREE from "three"
import {
	fitDistance,
	formatCount,
	formatLength,
	inspectModel,
	modelDistance,
	presetCamera,
	sectionPlane,
} from "./model-inspection"

const box = (size: number, material: THREE.Material) =>
	new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material)

describe("inspectModel", () => {
	it("counts meshes, triangles, shared materials and textures", () => {
		const texture = new THREE.Texture()
		const shared = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture })
		const root = new THREE.Group()
		root.add(box(1, shared), box(1, shared), box(1, new THREE.MeshBasicMaterial()))

		const stats = inspectModel(root, 2)

		expect(stats.meshes).toBe(3)
		expect(stats.triangles).toBe(36)
		expect(stats.materials).toBe(2)
		expect(stats.textures).toBe(1)
		expect(stats.animations).toBe(2)
	})

	it("counts every copy of an instanced mesh", () => {
		const instanced = new THREE.InstancedMesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshBasicMaterial(),
			5
		)
		expect(inspectModel(instanced).triangles).toBe(60)
	})

	it("measures the model in its own units", () => {
		const root = new THREE.Group()
		const wide = box(1, new THREE.MeshBasicMaterial())
		wide.scale.set(2, 1, 0.5)
		root.add(wide)
		expect(inspectModel(root).size).toEqual([2, 1, 0.5])
	})
})

describe("formatting", () => {
	it("keeps small counts exact and abbreviates large ones", () => {
		expect(formatCount(1234)).toBe("1,234")
		expect(formatCount(2_500_000)).toBe("2.5M")
	})

	it("shows lengths with sensible precision", () => {
		expect(formatLength(0.01234)).toBe("0.012")
		expect(formatLength(12.345)).toBe("12.35")
		expect(formatLength(1234.5)).toBe("1234.5")
	})
})

describe("camera presets", () => {
	it("backs off far enough that the whole model fits the narrower field of view", () => {
		const portrait = fitDistance(1, 45, 0.5)
		const landscape = fitDistance(1, 45, 2)
		expect(portrait).toBeGreaterThan(landscape)
		expect(landscape).toBeCloseTo(1 / Math.sin(THREE.MathUtils.degToRad(22.5)), 5)
	})

	it("looks at the model's centre from the chosen side", () => {
		const front = presetCamera("front", 1, 45, 1)
		expect(front.target).toEqual([0, 0, 0])
		expect(front.position[0]).toBeCloseTo(0)
		expect(front.position[2]).toBeGreaterThan(0)
		const top = presetCamera("top", 1, 45, 1)
		expect(top.position[1]).toBeGreaterThan(0)
	})
})

describe("sectionPlane", () => {
	it("keeps the half of the model on the near side of the cut", () => {
		const plane = sectionPlane("x", 0.5, [2, 1, 1], false)
		expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 0))).toBeGreaterThan(0)
		expect(plane.distanceToPoint(new THREE.Vector3(1.5, 0, 0))).toBeLessThan(0)
	})

	it("can keep the other half instead", () => {
		const plane = sectionPlane("x", 0.5, [2, 1, 1], true)
		expect(plane.distanceToPoint(new THREE.Vector3(1.5, 0, 0))).toBeGreaterThan(0)
		expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 0))).toBeLessThan(0)
	})
})

describe("modelDistance", () => {
	it("converts a distance in the normalised scene back to model units", () => {
		expect(modelDistance([0, 0, 0], [2, 0, 0], 0.5)).toBe(4)
	})
})
