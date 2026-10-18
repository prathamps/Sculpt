import { z } from "zod"

const MAX_ID_LENGTH = 64

export const idOf = (what: string) =>
	z.string().trim().min(1).max(MAX_ID_LENGTH).describe(`The ${what} id.`)

export const page = z.number().int().positive().optional().describe("Page number, starting at 1.")

export const pageSize = (maximum: number) =>
	z.number().int().positive().max(maximum).optional().describe(`Items per page (at most ${maximum}).`)

export const assignableRole = z
	.enum(["VIEWER", "MEMBER", "EDITOR"])
	.describe(
		"VIEWER can look; MEMBER can also comment and review; EDITOR can also upload and organise files."
	)

export const anyRole = z
	.enum(["VIEWER", "MEMBER", "EDITOR", "OWNER"])
	.describe("VIEWER < MEMBER < EDITOR < OWNER. OWNER can manage members, sharing and the project.")

export const mediaType = z.enum(["IMAGE", "VIDEO", "PDF", "MODEL"])

export const reviewStatus = z.enum(["PENDING", "CHANGES_REQUESTED", "APPROVED"])

export const fileInput = {
	fileName: z.string().trim().min(1).max(255).describe("File name including its extension, e.g. hero-v2.png."),
	mimeType: z
		.string()
		.max(100)
		.optional()
		.describe("MIME type, e.g. image/png. Inferred from the file name when omitted."),
	contentBase64: z
		.string()
		.optional()
		.describe("The file's bytes, base64-encoded. Provide this or sourceUrl."),
	sourceUrl: z
		.string()
		.url()
		.optional()
		.describe("A public https URL Sculpt's MCP server should download the file from. Provide this or contentBase64."),
}

export const pathSegment = (value: string): string => encodeURIComponent(value)
