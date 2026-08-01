import fs from "fs/promises"

const HEADER_LENGTH = 16

type SignatureCheck = (header: Buffer) => boolean

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
	(header) =>
		checks.some((check) => check(header))

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

const DECLARED_MIME_SIGNATURES: Record<string, SignatureCheck> = {
	"image/jpeg": bytes([0xff, 0xd8, 0xff]),
	"image/jpg": bytes([0xff, 0xd8, 0xff]),
	"image/png": bytes([0x89, 0x50, 0x4e, 0x47]),
	"image/gif": ascii("GIF8"),
	"image/webp": (header) =>
		bytes([0x52, 0x49, 0x46, 0x46])(header) && ascii("WEBP", 8)(header),
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
	"video/x-msvideo": (header) =>
		bytes([0x52, 0x49, 0x46, 0x46])(header) && ascii("AVI ", 8)(header),
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
}

const readHeader = async (filePath: string): Promise<Buffer> => {
	const handle = await fs.open(filePath, "r")
	try {
		const buffer = Buffer.alloc(HEADER_LENGTH)
		const { bytesRead } = await handle.read(buffer, 0, HEADER_LENGTH, 0)
		return buffer.subarray(0, bytesRead)
	} finally {
		await handle.close()
	}
}

export const matchesDeclaredMime = (
	header: Buffer,
	mimetype: string
): boolean => {
	const check = DECLARED_MIME_SIGNATURES[mimetype]
	if (!check) return true
	return check(header)
}

export const fileMatchesDeclaredMime = async (
	filePath: string,
	mimetype: string
): Promise<boolean> => {
	if (!(mimetype in DECLARED_MIME_SIGNATURES)) return true
	const header = await readHeader(filePath)
	return matchesDeclaredMime(header, mimetype)
}
