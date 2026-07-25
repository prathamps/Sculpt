import { prisma } from "../../lib/prisma"

export interface ReportComment {
	id: string
	author: string
	email: string
	content: string
	resolved: boolean
	timestamp: number | null
	annotationCount: number
	createdAt: Date
	replies: { author: string; content: string; createdAt: Date }[]
}

export interface ReportVersion {
	id: string
	versionName: string
	versionNumber: number
	mediaType: string
	url: string
	annotationCount: number
	comments: ReportComment[]
}

export interface ImageReport {
	generatedAt: string
	image: { id: string; name: string; projectId: string; projectName: string }
	versions: ReportVersion[]
	summary: {
		totalVersions: number
		totalComments: number
		resolvedComments: number
		openComments: number
	}
}

const countAnnotations = (annotation: unknown): number => {
	if (Array.isArray(annotation)) return annotation.length
	if (annotation && typeof annotation === "object") return 1
	return 0
}

export { getImageProjectId, isProjectMember } from "../projects/access"

export const buildImageReport = async (
	imageId: string
): Promise<ImageReport | null> => {
	const image = await prisma.image.findUnique({
		where: { id: imageId },
		include: {
			project: { select: { id: true, name: true } },
			versions: {
				orderBy: { versionNumber: "asc" },
				include: {
					comments: {
						where: { parentId: null },
						orderBy: { createdAt: "asc" },
						include: {
							user: { select: { name: true, email: true } },
							replies: {
								orderBy: { createdAt: "asc" },
								include: { user: { select: { name: true, email: true } } },
							},
						},
					},
				},
			},
		},
	})

	if (!image) return null

	let totalComments = 0
	let resolvedComments = 0

	const versions: ReportVersion[] = image.versions.map((version) => {
		const comments: ReportComment[] = version.comments.map((c) => {
			totalComments += 1
			if (c.resolved) resolvedComments += 1
			return {
				id: c.id,
				author: c.user?.name || c.user?.email || "Unknown",
				email: c.user?.email || "",
				content: c.content,
				resolved: c.resolved,
				timestamp: c.timestamp ?? null,
				annotationCount: countAnnotations(c.annotation),
				createdAt: c.createdAt,
				replies: (c.replies || []).map((r) => ({
					author: r.user?.name || r.user?.email || "Unknown",
					content: r.content,
					createdAt: r.createdAt,
				})),
			}
		})
		return {
			id: version.id,
			versionName: version.versionName,
			versionNumber: version.versionNumber,
			mediaType: version.mediaType,
			url: version.url,
			annotationCount: Array.isArray(version.annotations)
				? version.annotations.length
				: 0,
			comments,
		}
	})

	return {
		generatedAt: new Date().toISOString(),
		image: {
			id: image.id,
			name: image.name,
			projectId: image.project.id,
			projectName: image.project.name,
		},
		versions,
		summary: {
			totalVersions: versions.length,
			totalComments,
			resolvedComments,
			openComments: totalComments - resolvedComments,
		},
	}
}

const csvEscape = (value: unknown): string => {
	const s = value === null || value === undefined ? "" : String(value)
	if (/[",\n]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`
	}
	return s
}

export const buildImageReportCsv = (report: ImageReport): string => {
	const header = [
		"version",
		"mediaType",
		"author",
		"email",
		"content",
		"resolved",
		"timestamp",
		"annotations",
		"replies",
		"createdAt",
	]
	const rows: string[] = [header.join(",")]
	for (const version of report.versions) {
		for (const c of version.comments) {
			rows.push(
				[
					version.versionName,
					version.mediaType,
					c.author,
					c.email,
					c.content,
					c.resolved ? "resolved" : "open",
					c.timestamp != null ? c.timestamp.toFixed(2) : "",
					c.annotationCount,
					c.replies.length,
					c.createdAt.toISOString(),
				]
					.map(csvEscape)
					.join(",")
			)
		}
	}
	return rows.join("\n")
}
