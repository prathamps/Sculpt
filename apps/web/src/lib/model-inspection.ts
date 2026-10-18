import * as THREE from "three"
import type { Vec3 } from "@/types"

export interface ModelStats {
	meshes: number
	triangles: number
	vertices: number
	materials: number
	textures: number
	animations: number
	size: Vec3
}

const textureSlots = (material: THREE.Material): THREE.Texture[] =>
	Object.values(material).filter(
		(value): value is THREE.Texture => value instanceof THREE.Texture
	)

const trianglesOf = (geometry: THREE.BufferGeometry): number => {
	const index = geometry.getIndex()
	const count = index ? index.count : geometry.getAttribute("position")?.count ?? 0
	return Math.floor(count / 3)
}

const materialsOf = (mesh: THREE.Mesh): THREE.Material[] =>
	Array.isArray(mesh.material) ? mesh.material : [mesh.material]

export const inspectModel = (root: THREE.Object3D, animations = 0): ModelStats => {
	const materials = new Set<THREE.Material>()
	const textures = new Set<THREE.Texture>()
	let meshes = 0
	let triangles = 0
	let vertices = 0

	root.updateMatrixWorld(true)
	root.traverse((object) => {
		const mesh = object as THREE.Mesh
		if (!mesh.isMesh || !mesh.geometry) return
		meshes++
		const instances = (mesh as THREE.InstancedMesh).isInstancedMesh
			? (mesh as THREE.InstancedMesh).count
			: 1
		triangles += trianglesOf(mesh.geometry) * instances
		vertices += (mesh.geometry.getAttribute("position")?.count ?? 0) * instances
		materialsOf(mesh).forEach((material) => {
			materials.add(material)
			textureSlots(material).forEach((texture) => textures.add(texture))
		})
	})

	const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
	return {
		meshes,
		triangles,
		vertices,
		materials: materials.size,
		textures: textures.size,
		animations,
		size: [size.x, size.y, size.z],
	}
}

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })

export const formatCount = (value: number): string =>
	value < 10000 ? value.toLocaleString("en") : COMPACT.format(value)

export const formatLength = (value: number): string => {
	const magnitude = Math.abs(value)
	const digits = magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 3
	return value.toFixed(digits)
}

export type ViewPreset = "front" | "back" | "left" | "right" | "top" | "bottom" | "iso"

export const VIEW_PRESETS: { id: ViewPreset; label: string }[] = [
	{ id: "iso", label: "Three-quarter" },
	{ id: "front", label: "Front" },
	{ id: "back", label: "Back" },
	{ id: "left", label: "Left" },
	{ id: "right", label: "Right" },
	{ id: "top", label: "Top" },
	{ id: "bottom", label: "Bottom" },
]

const PRESET_DIRECTIONS: Record<ViewPreset, Vec3> = {
	front: [0, 0, 1],
	back: [0, 0, -1],
	left: [-1, 0, 0],
	right: [1, 0, 0],
	top: [0, 1, 0.0001],
	bottom: [0, -1, 0.0001],
	iso: [0.55, 0.4, 0.75],
}

const FRAMING_MARGIN = 1.2

export const fitDistance = (radius: number, verticalFovDegrees: number, aspect: number): number => {
	const vertical = THREE.MathUtils.degToRad(verticalFovDegrees)
	const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.0001))
	const limiting = Math.min(vertical, horizontal)
	return radius / Math.sin(limiting / 2)
}

export const presetCamera = (
	preset: ViewPreset,
	radius: number,
	verticalFovDegrees: number,
	aspect: number
): { position: Vec3; target: Vec3 } => {
	const direction = new THREE.Vector3(...PRESET_DIRECTIONS[preset]).normalize()
	const distance = fitDistance(radius, verticalFovDegrees, aspect) * FRAMING_MARGIN
	return {
		position: direction.multiplyScalar(distance).toArray() as Vec3,
		target: [0, 0, 0],
	}
}

export type SectionAxis = "x" | "y" | "z"

export const sectionPlane = (
	axis: SectionAxis,
	fraction: number,
	halfExtents: Vec3,
	flipped: boolean
): THREE.Plane => {
	const index = axis === "x" ? 0 : axis === "y" ? 1 : 2
	const normal = new THREE.Vector3()
	normal.setComponent(index, flipped ? 1 : -1)
	const position = THREE.MathUtils.clamp(fraction, -1, 1) * halfExtents[index]
	return new THREE.Plane(normal, flipped ? -position : position)
}

export const modelDistance = (a: Vec3, b: Vec3, normalizedScale: number): number =>
	new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)) / (normalizedScale || 1)
