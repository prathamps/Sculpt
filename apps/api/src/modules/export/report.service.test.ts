import { describe, expect, it } from "vitest"
import { buildImageReportCsv, ImageReport } from "./report.service"

const baseReport = (versions: ImageReport["versions"]): ImageReport => ({
	generatedAt: "2026-07-17T00:00:00.000Z",
	image: { id: "img1", name: "Hero", projectId: "p1", projectName: "Site" },
	versions,
	summary: {
		totalVersions: versions.length,
		totalComments: 0,
		resolvedComments: 0,
		openComments: 0,
	},
})

const comment = (
	overrides: Partial<ImageReport["versions"][0]["comments"][0]> = {}
) => ({
	id: "c1",
	author: "Ada",
	email: "ada@example.com",
	content: "Looks good",
	resolved: false,
	timestamp: null,
	annotationCount: 0,
	createdAt: new Date("2026-07-17T10:00:00.000Z"),
	replies: [],
	...overrides,
})

const version = (
	comments: ImageReport["versions"][0]["comments"]
): ImageReport["versions"][0] => ({
	id: "v1",
	versionName: "Version 1",
	versionNumber: 1,
	mediaType: "IMAGE",
	url: "uploads/a.png",
	annotationCount: 0,
	comments,
})

describe("buildImageReportCsv", () => {
	it("produces only the header for a report without comments", () => {
		const csv = buildImageReportCsv(baseReport([version([])]))
		expect(csv).toBe(
			"version,mediaType,author,email,content,resolved,timestamp,annotations,replies,createdAt"
		)
	})

	it("flattens one row per top-level comment with reply counts", () => {
		const csv = buildImageReportCsv(
			baseReport([
				version([
					comment({
						replies: [
							{ author: "Bob", content: "agree", createdAt: new Date() },
						],
					}),
				]),
			])
		)
		const rows = csv.split("\n")
		expect(rows).toHaveLength(2)
		expect(rows[1]).toBe(
			"Version 1,IMAGE,Ada,ada@example.com,Looks good,open,,0,1,2026-07-17T10:00:00.000Z"
		)
	})

	it("escapes commas, quotes and newlines in comment content", () => {
		const csv = buildImageReportCsv(
			baseReport([
				version([comment({ content: 'move "logo", then\nresize' })]),
			])
		)
		expect(csv.split("\n").slice(1).join("\n")).toContain(
			'"move ""logo"", then\nresize"'
		)
	})

	it("marks resolved comments and formats video timestamps to two decimals", () => {
		const csv = buildImageReportCsv(
			baseReport([version([comment({ resolved: true, timestamp: 12.3456 })])])
		)
		const row = csv.split("\n")[1]
		expect(row).toContain(",resolved,")
		expect(row).toContain("12.35")
	})

	it("defuses a spreadsheet formula hidden in comment content", () => {
		const csv = buildImageReportCsv(
			baseReport([
				version([comment({ content: '=HYPERLINK("http://evil.test","clickme")' })]),
			])
		)
		expect(csv).toContain("'=HYPERLINK")
		expect(csv).not.toMatch(/(^|,|")=HYPERLINK/m)
	})

	it("defuses every formula trigger character a spreadsheet honours", () => {
		for (const prefix of ["=", "+", "-", "@"]) {
			const csv = buildImageReportCsv(
				baseReport([version([comment({ content: `${prefix}cmd|'/c calc'!A1` })])])
			)
			expect(csv).toContain(`'${prefix}cmd`)
		}
	})

	it("defuses a formula smuggled through the author name", () => {
		const csv = buildImageReportCsv(
			baseReport([version([comment({ author: "=1+1" })])])
		)
		expect(csv).toContain("'=1+1")
	})

	it("leaves ordinary content unprefixed", () => {
		const csv = buildImageReportCsv(
			baseReport([version([comment({ content: "looks good to me" })])])
		)
		expect(csv).toContain("looks good to me")
		expect(csv).not.toContain("'looks good")
	})
})
