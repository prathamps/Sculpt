import type { WebGLRenderer } from "three"
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"

const DRACO_DECODER_PATH = "/three/draco/"
const BASIS_TRANSCODER_PATH = "/three/basis/"

type MeshoptDecoderModule = Parameters<GLTFLoader["setMeshoptDecoder"]>[0]

export interface CompressionModules {
	DRACOLoader: new () => DRACOLoader
	KTX2Loader: new () => KTX2Loader
	MeshoptDecoder: MeshoptDecoderModule
}

export const loadCompressionModules = async (): Promise<CompressionModules> => {
	const [draco, ktx2, meshopt] = await Promise.all([
		import("three/examples/jsm/loaders/DRACOLoader.js"),
		import("three/examples/jsm/loaders/KTX2Loader.js"),
		import("three/examples/jsm/libs/meshopt_decoder.module.js"),
	])
	return {
		DRACOLoader: draco.DRACOLoader,
		KTX2Loader: ktx2.KTX2Loader,
		MeshoptDecoder: meshopt.MeshoptDecoder,
	}
}

const decoderCache = new WeakMap<
	CompressionModules,
	{ draco: DRACOLoader; ktx2?: KTX2Loader }
>()

export const configureGltfCompression = (
	loader: GLTFLoader,
	modules: CompressionModules,
	renderer?: WebGLRenderer
): GLTFLoader => {
	let cached = decoderCache.get(modules)

	if (!cached) {
		const draco = new modules.DRACOLoader()
		draco.setDecoderPath(DRACO_DECODER_PATH)
		cached = { draco }
		decoderCache.set(modules, cached)
	}

	loader.setDRACOLoader(cached.draco)

	if (renderer) {
		if (!cached.ktx2) {
			const ktx2 = new modules.KTX2Loader()
			ktx2.setTranscoderPath(BASIS_TRANSCODER_PATH)
			cached.ktx2 = ktx2
		}
		cached.ktx2.detectSupport(renderer)
		loader.setKTX2Loader(cached.ktx2)
	}

	loader.setMeshoptDecoder(modules.MeshoptDecoder)
	return loader
}

export const disposeCompressionModules = (
	modules: CompressionModules
): void => {
	const cached = decoderCache.get(modules)
	if (!cached) return
	cached.draco.dispose()
	cached.ktx2?.dispose()
	decoderCache.delete(modules)
}
