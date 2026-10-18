import * as THREE from "three"
import { MeshBVH } from "three-mesh-bvh"

export interface DeviationField {
	distances: Float32Array
	max: number
	mean: number
}

export interface DeviationSummary {
	changedShare: number
	max: number
	mean: number
}

const DEFAULT_CHUNK = 4000
const UNCHANGED_COLOR: [number, number, number] = [0.6, 0.64, 0.7]
const SMALL_CHANGE_COLOR: [number, number, number] = [1, 0.82, 0.2]
const LARGE_CHANGE_COLOR: [number, number, number] = [0.86, 0.13, 0.1]
export const DEFAULT_TOLERANCE_SHARE = 0.005

const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
	const meshes: THREE.Mesh[] = []
	root.updateMatrixWorld(true)
	root.traverse((object) => {
		const mesh = object as THREE.Mesh
		if (mesh.isMesh && mesh.geometry?.getAttribute("position")) meshes.push(mesh)
	})
	return meshes
}

export const worldSpaceGeometry = (root: THREE.Object3D): THREE.BufferGeometry => {
	const meshes = meshesOf(root)
	let vertexCount = 0
	let indexCount = 0
	meshes.forEach((mesh) => {
		const count = mesh.geometry.getAttribute("position").count
		vertexCount += count
		indexCount += mesh.geometry.getIndex()?.count ?? count
	})

	const positions = new Float32Array(vertexCount * 3)
	const indices = new Uint32Array(indexCount)
	const vertex = new THREE.Vector3()
	let vertexOffset = 0
	let indexOffset = 0
	meshes.forEach((mesh) => {
		const position = mesh.geometry.getAttribute("position")
		for (let i = 0; i < position.count; i++) {
			vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
			positions.set([vertex.x, vertex.y, vertex.z], (vertexOffset + i) * 3)
		}
		const index = mesh.geometry.getIndex()
		const count = index ? index.count : position.count
		for (let i = 0; i < count; i++) {
			indices[indexOffset + i] = vertexOffset + (index ? index.getX(i) : i)
		}
		vertexOffset += position.count
		indexOffset += count
	})

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setIndex(new THREE.BufferAttribute(indices, 1))
	geometry.computeVertexNormals()
	geometry.computeBoundingBox()
	return geometry
}

const nextFrame = (): Promise<void> =>
	new Promise((resolve) =>
		typeof requestAnimationFrame === "function"
			? requestAnimationFrame(() => resolve())
			: setTimeout(resolve, 0)
	)

export const measureDeviation = async (
	reference: THREE.BufferGeometry,
	candidate: THREE.BufferGeometry,
	options: {
		chunk?: number
		onProgress?: (fraction: number) => void
		isCancelled?: () => boolean
		yieldToBrowser?: () => Promise<void>
	} = {}
): Promise<DeviationField | null> => {
	const chunk = options.chunk ?? DEFAULT_CHUNK
	const yieldToBrowser = options.yieldToBrowser ?? nextFrame
	const bvh = new MeshBVH(reference)
	const position = candidate.getAttribute("position")
	const distances = new Float32Array(position.count)
	const point = new THREE.Vector3()
	const target = new THREE.Vector3()
	let max = 0
	let total = 0

	for (let start = 0; start < position.count; start += chunk) {
		if (options.isCancelled?.()) return null
		const end = Math.min(position.count, start + chunk)
		for (let i = start; i < end; i++) {
			point.fromBufferAttribute(position, i)
			const distance = bvh.closestPointToPoint(point, { point: target, distance: 0, faceIndex: 0 })
				?.distance ?? 0
			distances[i] = distance
			max = Math.max(max, distance)
			total += distance
		}
		options.onProgress?.(end / position.count)
		if (end < position.count) await yieldToBrowser()
	}

	return { distances, max, mean: position.count ? total / position.count : 0 }
}

const mix = (
	from: [number, number, number],
	to: [number, number, number],
	t: number
): [number, number, number] => [
	from[0] + (to[0] - from[0]) * t,
	from[1] + (to[1] - from[1]) * t,
	from[2] + (to[2] - from[2]) * t,
]

export const deviationColor = (
	distance: number,
	tolerance: number,
	max: number
): [number, number, number] => {
	if (distance <= tolerance) return UNCHANGED_COLOR
	const span = Math.max(max - tolerance, Number.EPSILON)
	return mix(SMALL_CHANGE_COLOR, LARGE_CHANGE_COLOR, Math.min(1, (distance - tolerance) / span))
}

export const deviationColors = (field: DeviationField, tolerance: number): Float32Array => {
	const colors = new Float32Array(field.distances.length * 3)
	field.distances.forEach((distance, index) => {
		colors.set(deviationColor(distance, tolerance, field.max), index * 3)
	})
	return colors
}

export const summariseDeviation = (field: DeviationField, tolerance: number): DeviationSummary => {
	let changed = 0
	field.distances.forEach((distance) => {
		if (distance > tolerance) changed++
	})
	return {
		changedShare: field.distances.length ? changed / field.distances.length : 0,
		max: field.max,
		mean: field.mean,
	}
}

export const boundsDiagonal = (...geometries: THREE.BufferGeometry[]): number => {
	const union = new THREE.Box3()
	geometries.forEach((geometry) => {
		if (!geometry.boundingBox) geometry.computeBoundingBox()
		if (geometry.boundingBox) union.union(geometry.boundingBox)
	})
	return union.isEmpty() ? 1 : union.getSize(new THREE.Vector3()).length() || 1
}

export const faceDeviation = (field: DeviationField, vertices: number[]): number =>
	vertices.length
		? vertices.reduce((sum, vertex) => sum + (field.distances[vertex] ?? 0), 0) / vertices.length
		: 0

export const UNCHANGED_CSS = `rgb(${UNCHANGED_COLOR.map((channel) => Math.round(channel * 255)).join(" ")})`
export const SMALL_CHANGE_CSS = `rgb(${SMALL_CHANGE_COLOR.map((channel) => Math.round(channel * 255)).join(" ")})`
export const LARGE_CHANGE_CSS = `rgb(${LARGE_CHANGE_COLOR.map((channel) => Math.round(channel * 255)).join(" ")})`
