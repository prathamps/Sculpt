export const PNG_1PX = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64"
)

export const buildMinimalPdf = () => {
	const objects = [
		"<</Type/Catalog/Pages 2 0 R>>",
		"<</Type/Pages/Kids[3 0 R]/Count 1>>",
		"<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>",
	]
	let body = "%PDF-1.4\n"
	const offsets = []
	objects.forEach((content, index) => {
		offsets.push(body.length)
		body += `${index + 1} 0 obj\n${content}\nendobj\n`
	})
	const xrefStart = body.length
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
	for (const offset of offsets) {
		body += `${String(offset).padStart(10, "0")} 00000 n \n`
	}
	body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`
	return Buffer.from(body, "latin1")
}

export const buildCubeGlb = () => {
	const faces = [
		{ n: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
		{ n: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
		{ n: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
		{ n: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
		{ n: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
		{ n: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
	]
	const positions = []
	const normals = []
	for (const { n, corners } of faces) {
		for (const i of [0, 1, 2, 0, 2, 3]) {
			positions.push(...corners[i])
			normals.push(...n)
		}
	}
	const posBuf = new Float32Array(positions)
	const nrmBuf = new Float32Array(normals)
	const bin = Buffer.concat([
		Buffer.from(posBuf.buffer),
		Buffer.from(nrmBuf.buffer),
	])

	const gltf = {
		asset: { version: "2.0", generator: "sculpt-e2e" },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
		materials: [
			{
				pbrMetallicRoughness: {
					baseColorFactor: [0.31, 0.51, 0.9, 1],
					metallicFactor: 0.1,
					roughnessFactor: 0.7,
				},
			},
		],
		buffers: [{ byteLength: bin.length }],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: posBuf.byteLength },
			{ buffer: 0, byteOffset: posBuf.byteLength, byteLength: nrmBuf.byteLength },
		],
		accessors: [
			{
				bufferView: 0,
				componentType: 5126,
				count: 36,
				type: "VEC3",
				min: [-1, -1, -1],
				max: [1, 1, 1],
			},
			{ bufferView: 1, componentType: 5126, count: 36, type: "VEC3" },
		],
	}

	let json = Buffer.from(JSON.stringify(gltf))
	json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
	const binPadded = Buffer.concat([
		bin,
		Buffer.alloc((4 - (bin.length % 4)) % 4),
	])

	const header = Buffer.alloc(12)
	header.writeUInt32LE(0x46546c67, 0)
	header.writeUInt32LE(2, 4)
	header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8)
	const jsonHeader = Buffer.alloc(8)
	jsonHeader.writeUInt32LE(json.length, 0)
	jsonHeader.writeUInt32LE(0x4e4f534a, 4)
	const binHeader = Buffer.alloc(8)
	binHeader.writeUInt32LE(binPadded.length, 0)
	binHeader.writeUInt32LE(0x004e4942, 4)
	return Buffer.concat([header, jsonHeader, json, binHeader, binPadded])
}
