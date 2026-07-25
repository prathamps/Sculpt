import type * as ThreeModule from "three"
import { GLB_MIME, extensionOf, needsGlbConversion } from "./model-formats"
import {
	configureGltfCompression,
	loadCompressionModules,
} from "./gltf-decoders"

type Three = typeof ThreeModule
type Object3D = ThreeModule.Object3D
type BufferGeometry = ThreeModule.BufferGeometry

const THUMBNAIL_WIDTH = 640
const THUMBNAIL_HEIGHT = 360
const NORMALIZED_MODEL_SIZE = 4
const MAX_BYTES_TO_PARSE_IN_BROWSER = 256 * 1024 * 1024

const loadThree = (): Promise<Three> => import("three")

const asMesh = (three: Three, geometry: BufferGeometry): Object3D => {
	geometry.computeVertexNormals()
	return new three.Mesh(
		geometry,
		new three.MeshStandardMaterial({
			color: 0x9bb4d4,
			metalness: 0.1,
			roughness: 0.7,
		})
	)
}

const decodeText = (buffer: ArrayBuffer): string =>
	new TextDecoder().decode(buffer)

type SceneParser = (three: Three, buffer: ArrayBuffer) => Promise<Object3D>

const parseGltf: SceneParser = async (_three, buffer) => {
	const [{ GLTFLoader }, compression] = await Promise.all([
		import("three/examples/jsm/loaders/GLTFLoader.js"),
		loadCompressionModules(),
	])
	const loader = configureGltfCompression(new GLTFLoader(), compression)
	return new Promise<Object3D>((resolve, reject) => {
		loader.parse(buffer, "", (gltf) => resolve(gltf.scene), reject)
	})
}

const sceneParsers: Record<string, SceneParser> = {
	glb: parseGltf,
	gltf: parseGltf,
	fbx: async (_three, buffer) => {
		const { FBXLoader } = await import(
			"three/examples/jsm/loaders/FBXLoader.js"
		)
		return new FBXLoader().parse(buffer, "")
	},
	obj: async (_three, buffer) => {
		const { OBJLoader } = await import(
			"three/examples/jsm/loaders/OBJLoader.js"
		)
		return new OBJLoader().parse(decodeText(buffer))
	},
	stl: async (three, buffer) => {
		const { STLLoader } = await import(
			"three/examples/jsm/loaders/STLLoader.js"
		)
		return asMesh(three, new STLLoader().parse(buffer))
	},
	ply: async (three, buffer) => {
		const { PLYLoader } = await import(
			"three/examples/jsm/loaders/PLYLoader.js"
		)
		return asMesh(three, new PLYLoader().parse(buffer))
	},
	dae: async (_three, buffer) => {
		const { ColladaLoader } = await import(
			"three/examples/jsm/loaders/ColladaLoader.js"
		)
		return new ColladaLoader().parse(decodeText(buffer), "").scene
	},
	"3mf": async (_three, buffer) => {
		const { ThreeMFLoader } = await import(
			"three/examples/jsm/loaders/3MFLoader.js"
		)
		return new ThreeMFLoader().parse(buffer)
	},
	"3ds": async (_three, buffer) => {
		const { TDSLoader } = await import(
			"three/examples/jsm/loaders/TDSLoader.js"
		)
		return new TDSLoader().parse(buffer, "")
	},
	usdz: async (_three, buffer) => {
		const { USDZLoader } = await import(
			"three/examples/jsm/loaders/USDZLoader.js"
		)
		return new USDZLoader().parse(buffer)
	},
	amf: async (_three, buffer) => {
		const { AMFLoader } = await import(
			"three/examples/jsm/loaders/AMFLoader.js"
		)
		return new AMFLoader().parse(buffer)
	},
	wrl: async (_three, buffer) => {
		const { VRMLLoader } = await import(
			"three/examples/jsm/loaders/VRMLLoader.js"
		)
		return new VRMLLoader().parse(decodeText(buffer), "")
	},
	kmz: async (_three, buffer) => {
		const { KMZLoader } = await import(
			"three/examples/jsm/loaders/KMZLoader.js"
		)
		return new KMZLoader().parse(buffer).scene
	},
	vox: async (_three, buffer) => {
		const { VOXLoader } = await import(
			"three/examples/jsm/loaders/VOXLoader.js"
		)
		return new VOXLoader().parse(buffer).scene
	},
	pcd: async (_three, buffer) => {
		const { PCDLoader } = await import(
			"three/examples/jsm/loaders/PCDLoader.js"
		)
		return new PCDLoader().parse(buffer)
	},
	xyz: async (three, buffer) => {
		const { XYZLoader } = await import(
			"three/examples/jsm/loaders/XYZLoader.js"
		)
		return new Promise<Object3D>((resolve, reject) => {
			try {
				new XYZLoader().parse(decodeText(buffer), (geometry) => {
					resolve(
						new three.Points(
							geometry,
							new three.PointsMaterial({ size: 0.05, vertexColors: true })
						)
					)
				})
			} catch (error) {
				reject(error)
			}
		})
	},
	gcode: async (_three, buffer) => {
		const { GCodeLoader } = await import(
			"three/examples/jsm/loaders/GCodeLoader.js"
		)
		return new GCodeLoader().parse(decodeText(buffer))
	},
}

export const canRenderModelFormat = (fileName: string): boolean =>
	extensionOf(fileName) in sceneParsers

const centeredAndScaled = (three: Three, model: Object3D): Object3D => {
	const box = new three.Box3().setFromObject(model)
	if (box.isEmpty()) return model
	const center = box.getCenter(new three.Vector3())
	const size = box.getSize(new three.Vector3())
	const maxDimension = Math.max(size.x, size.y, size.z) || 1
	model.position.sub(center)
	const group = new three.Group()
	group.add(model)
	group.scale.setScalar(NORMALIZED_MODEL_SIZE / maxDimension)
	return group
}

const canvasToTransparentPng = (
	canvas: HTMLCanvasElement
): Promise<Blob | null> =>
	new Promise((resolve) => canvas.toBlob(resolve, "image/png"))

const renderToTransparentPng = async (
	three: Three,
	model: Object3D
): Promise<Blob | null> => {
	const canvas = document.createElement("canvas")
	canvas.width = THUMBNAIL_WIDTH
	canvas.height = THUMBNAIL_HEIGHT
	const renderer = new three.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		preserveDrawingBuffer: true,
	})
	try {
		renderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, false)
		const scene = new three.Scene()
		scene.add(new three.AmbientLight(0xffffff, 0.9))
		scene.add(new three.HemisphereLight(0xffffff, 0x555566, 0.6))
		const key = new three.DirectionalLight(0xffffff, 1.4)
		key.position.set(5, 8, 5)
		scene.add(key)
		const fill = new three.DirectionalLight(0xffffff, 0.5)
		fill.position.set(-5, -3, -5)
		scene.add(fill)
		scene.add(centeredAndScaled(three, model))

		const camera = new three.PerspectiveCamera(
			45,
			THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT,
			0.1,
			100
		)
		camera.position.set(3.5, 2.5, 5.5)
		camera.lookAt(0, 0, 0)
		renderer.render(scene, camera)
		return await canvasToTransparentPng(canvas)
	} finally {
		renderer.dispose()
	}
}

const exportGlb = async (model: Object3D): Promise<Blob> => {
	const { GLTFExporter } = await import(
		"three/examples/jsm/exporters/GLTFExporter.js"
	)
	return new Promise<Blob>((resolve, reject) => {
		new GLTFExporter().parse(
			model,
			(result) => resolve(new Blob([result as ArrayBuffer], { type: GLB_MIME })),
			reject,
			{ binary: true }
		)
	})
}

export interface PreparedModelUpload {
	glb: Blob | null
	thumbnail: Blob | null
	failureReason: string | null
}

const readableReason = (error: unknown): string => {
	const message = error instanceof Error ? error.message : String(error)
	return message.replace(/^(THREE\.)?\w+Loader:\s*/, "").slice(0, 200)
}

export async function prepareModelUpload(
	file: File
): Promise<PreparedModelUpload> {
	const parse = sceneParsers[extensionOf(file.name)]
	if (!parse) return { glb: null, thumbnail: null, failureReason: null }

	if (file.size > MAX_BYTES_TO_PARSE_IN_BROWSER) {
		console.warn(
			`${file.name} is too large to parse in the browser; uploading it without a thumbnail`
		)
		return { glb: null, thumbnail: null, failureReason: null }
	}

	try {
		const three = await loadThree()
		const model = await parse(three, await file.arrayBuffer())
		let thumbnail: Blob | null = null
		try {
			thumbnail = await renderToTransparentPng(three, model)
		} catch (renderError) {
			console.error(
				`Could not render a 3D thumbnail for ${file.name}:`,
				renderError
			)
		}
		const glb = needsGlbConversion(file) ? await exportGlb(model) : null
		return { glb, thumbnail, failureReason: null }
	} catch (error) {
		console.error(`Could not prepare 3D upload for ${file.name}:`, error)
		return {
			glb: null,
			thumbnail: null,
			failureReason: readableReason(error),
		}
	}
}
