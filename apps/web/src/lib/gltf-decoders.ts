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

export const configureGltfCompression = (
	loader: GLTFLoader,
	modules: CompressionModules,
	renderer?: WebGLRenderer
): GLTFLoader => {
	const draco = new modules.DRACOLoader()
	draco.setDecoderPath(DRACO_DECODER_PATH)
	loader.setDRACOLoader(draco)

	if (renderer) {
		const ktx2 = new modules.KTX2Loader()
		ktx2.setTranscoderPath(BASIS_TRANSCODER_PATH)
		ktx2.detectSupport(renderer)
		loader.setKTX2Loader(ktx2)
	}

	loader.setMeshoptDecoder(modules.MeshoptDecoder)
	return loader
}
