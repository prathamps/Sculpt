export const GLB_MIME = "model/gltf-binary"

export const MODEL_SOURCE_MIME_BY_EXTENSION: Record<string, string> = {
	glb: GLB_MIME,
	gltf: "model/gltf+json",
	fbx: "model/fbx",
	obj: "model/obj",
	stl: "model/stl",
	ply: "model/ply",
	dae: "model/vnd.collada+xml",
	"3mf": "model/3mf",
	"3ds": "image/x-3ds",
	usdz: "model/vnd.usdz+zip",
	amf: "application/x-amf",
	wrl: "model/vrml",
	kmz: "model/vnd.kmz",
	vox: "model/vox",
	pcd: "model/pcd",
	xyz: "model/xyz",
	gcode: "text/x.gcode",
}

export const MODEL_EXTENSIONS = Object.keys(MODEL_SOURCE_MIME_BY_EXTENSION)

export const MODEL_FILE_ACCEPT = MODEL_EXTENSIONS.map((ext) => `.${ext}`).join(
	","
)

export const extensionOf = (fileName: string): string =>
	fileName.toLowerCase().split(".").pop() ?? ""

export const isModelFile = (file: File): boolean =>
	extensionOf(file.name) in MODEL_SOURCE_MIME_BY_EXTENSION

export const needsGlbConversion = (file: File): boolean =>
	isModelFile(file) && extensionOf(file.name) !== "glb"
