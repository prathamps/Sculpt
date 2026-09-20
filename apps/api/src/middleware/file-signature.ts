import fs from "fs/promises"

const HEADER_LENGTH = 512

type SignatureCheck = (header: Buffer, size: number) => boolean

const ascii =
	(text: string, offset = 0): SignatureCheck =>
	(header) =>
		header.length >= offset + text.length &&
		header.toString("latin1", offset, offset + text.length) === text

const bytes =
	(expected: number[], offset = 0): SignatureCheck =>
	(header) =>
		header.length >= offset + expected.length &&
		expected.every((byte, index) => header[offset + index] === byte)

const anyOf =
	(...checks: SignatureCheck[]): SignatureCheck =>
	(header, size) =>
		checks.some((check) => check(header, size))

const BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf]

const WHITESPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20])

const TEXT_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0c, 0x0d, 0x1b])

const isTextByte = (byte: number): boolean =>
	byte >= 0x20 || TEXT_CONTROL_BYTES.has(byte)

const plainText: SignatureCheck = (header) =>
	header.length > 0 && header.every(isTextByte)

const skipLeadingWhitespace = (header: Buffer): Buffer => {
	let index = bytes(BYTE_ORDER_MARK)(header, header.length)
		? BYTE_ORDER_MARK.length
		: 0
	while (index < header.length && WHITESPACE.has(header[index])) index++
	return header.subarray(index)
}

const startsWithAfterWhitespace =
	(...prefixes: string[]): SignatureCheck =>
	(header) => {
		const trimmed = skipLeadingWhitespace(header)
		return prefixes.some(
			(prefix) => trimmed.toString("latin1", 0, prefix.length) === prefix
		)
	}

const jsonObject = startsWithAfterWhitespace("{")

const xmlDocument = startsWithAfterWhitespace("<?xml", "<COLLADA", "<amf", "<AMF")

const zipArchive = anyOf(
	bytes([0x50, 0x4b, 0x03, 0x04]),
	bytes([0x50, 0x4b, 0x05, 0x06]),
	bytes([0x50, 0x4b, 0x07, 0x08])
)

const ISO_MEDIA_BOX_TYPES = new Set([
	"ftyp",
	"moov",
	"mdat",
	"free",
	"wide",
	"skip",
	"pnot",
])

const isoBaseMediaFile: SignatureCheck = (header) =>
	header.length >= 8 && ISO_MEDIA_BOX_TYPES.has(header.toString("latin1", 4, 8))

const ebml = bytes([0x1a, 0x45, 0xdf, 0xa3])
const asfHeader = bytes([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])
const mpegProgramStream = anyOf(
	bytes([0x00, 0x00, 0x01, 0xba]),
	bytes([0x00, 0x00, 0x01, 0xb3])
)
const mpegTransportStream = anyOf(bytes([0x47]), bytes([0x47], 4))

const TGA_IMAGE_TYPES = new Set([0, 1, 2, 3, 9, 10, 11, 32, 33])

const truevisionTarga: SignatureCheck = (header) =>
	header.length >= 3 && header[1] <= 1 && TGA_IMAGE_TYPES.has(header[2])

const BINARY_STL_HEADER_BYTES = 80
const BINARY_STL_TRIANGLE_BYTES = 50

const binaryStl: SignatureCheck = (header, size) => {
	if (header.length < BINARY_STL_HEADER_BYTES + 4) return false
	const triangles = header.readUInt32LE(BINARY_STL_HEADER_BYTES)
	return (
		size ===
		BINARY_STL_HEADER_BYTES + 4 + triangles * BINARY_STL_TRIANGLE_BYTES
	)
}

const stereolithography = anyOf(startsWithAfterWhitespace("solid"), binaryStl)

const filmboxScene = anyOf(
	ascii("Kaydara FBX Binary"),
	startsWithAfterWhitespace("; FBX"),
	plainText
)

const pointCloudData = anyOf(
	startsWithAfterWhitespace("#"),
	startsWithAfterWhitespace("VERSION")
)

const DECLARED_MIME_SIGNATURES: Record<string, SignatureCheck> = {
	"image/jpeg": bytes([0xff, 0xd8, 0xff]),
	"image/jpg": bytes([0xff, 0xd8, 0xff]),
	"image/png": bytes([0x89, 0x50, 0x4e, 0x47]),
	"image/gif": ascii("GIF8"),
	"image/webp": (header, size) =>
		bytes([0x52, 0x49, 0x46, 0x46])(header, size) &&
		ascii("WEBP", 8)(header, size),
	"image/avif": isoBaseMediaFile,
	"image/bmp": ascii("BM"),
	"image/x-icon": anyOf(bytes([0, 0, 1, 0]), bytes([0, 0, 2, 0])),
	"image/tiff": anyOf(
		bytes([0x49, 0x49, 0x2a, 0x00]),
		bytes([0x4d, 0x4d, 0x00, 0x2a])
	),
	"image/x-targa": truevisionTarga,
	"image/x-tga": truevisionTarga,
	"image/vnd.adobe.photoshop": ascii("8BPS"),
	"image/x-exr": bytes([0x76, 0x2f, 0x31, 0x01]),
	"image/x-dpx": anyOf(ascii("SDPX"), ascii("XPDS")),
	"image/jp2": anyOf(
		bytes([0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50]),
		bytes([0xff, 0x4f, 0xff, 0x51])
	),
	"image/x-pcx": bytes([0x0a]),
	"image/x-portable-pixmap": anyOf(
		ascii("P1"),
		ascii("P2"),
		ascii("P3"),
		ascii("P4"),
		ascii("P5"),
		ascii("P6")
	),
	"application/pdf": ascii("%PDF"),
	"video/mp4": isoBaseMediaFile,
	"video/x-m4v": isoBaseMediaFile,
	"video/quicktime": isoBaseMediaFile,
	"video/3gpp": isoBaseMediaFile,
	"video/3gpp2": isoBaseMediaFile,
	"video/webm": ebml,
	"video/x-matroska": ebml,
	"video/x-msvideo": (header, size) =>
		bytes([0x52, 0x49, 0x46, 0x46])(header, size) &&
		ascii("AVI ", 8)(header, size),
	"video/x-ms-wmv": asfHeader,
	"video/x-ms-asf": asfHeader,
	"video/x-flv": ascii("FLV"),
	"video/mpeg": mpegProgramStream,
	"video/dvd": mpegProgramStream,
	"video/mp2t": mpegTransportStream,
	"video/mp2t-m2ts": mpegTransportStream,
	"video/ogg": ascii("OggS"),
	"application/mxf": bytes([0x06, 0x0e, 0x2b, 0x34]),
	"video/x-dv": bytes([0x1f, 0x07]),
	"model/gltf-binary": ascii("glTF"),
	"model/gltf+json": jsonObject,
	"model/fbx": filmboxScene,
	"model/obj": plainText,
	"model/stl": stereolithography,
	"model/ply": startsWithAfterWhitespace("ply"),
	"model/vnd.collada+xml": xmlDocument,
	"model/3mf": zipArchive,
	"image/x-3ds": bytes([0x4d, 0x4d]),
	"model/vnd.usdz+zip": zipArchive,
	"application/x-amf": anyOf(xmlDocument, zipArchive),
	"model/vrml": startsWithAfterWhitespace("#VRML"),
	"model/vnd.kmz": zipArchive,
	"model/vox": ascii("VOX "),
	"model/pcd": pointCloudData,
	"model/xyz": plainText,
	"text/x.gcode": plainText,
}

export const hasDeclaredMimeSignature = (mimetype: string): boolean =>
	mimetype in DECLARED_MIME_SIGNATURES

const readSample = async (
	filePath: string
): Promise<{ header: Buffer; size: number }> => {
	const handle = await fs.open(filePath, "r")
	try {
		const { size } = await handle.stat()
		const buffer = Buffer.alloc(HEADER_LENGTH)
		const { bytesRead } = await handle.read(buffer, 0, HEADER_LENGTH, 0)
		return { header: buffer.subarray(0, bytesRead), size }
	} finally {
		await handle.close()
	}
}

export const matchesDeclaredMime = (
	header: Buffer,
	mimetype: string,
	size = header.length
): boolean => {
	const check = DECLARED_MIME_SIGNATURES[mimetype]
	if (!check) return false
	return check(header, size)
}

export const fileMatchesDeclaredMime = async (
	filePath: string,
	mimetype: string
): Promise<boolean> => {
	if (!hasDeclaredMimeSignature(mimetype)) return false
	const { header, size } = await readSample(filePath)
	return matchesDeclaredMime(header, mimetype, size)
}
