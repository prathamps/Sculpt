import { prisma } from "../../lib/prisma"

export const SEARCH_RESULT_LIMIT = 20

export interface SearchHit {
	id: string
	label: string
	projectId: string
	projectName: string
}

export interface MediaSearchHit extends SearchHit {
	mediaType: string
	thumbnailUrl: string | null
}

export interface CommentSearchHit extends SearchHit {
	imageId: string
	imageVersionId: string
	authorName: string | null
	createdAt: Date
}

export interface SearchResults {
	projects: SearchHit[]
	media: MediaSearchHit[]
	comments: CommentSearchHit[]
}

const emptyResults = (): SearchResults => ({
	projects: [],
	media: [],
	comments: [],
})

const accessibleProjectIds = async (userId: string): Promise<string[]> => {
	const memberships = await prisma.projectMember.findMany({
		where: { userId },
		select: { projectId: true },
	})
	return memberships.map((membership) => membership.projectId)
}

export const searchForUser = async (
	userId: string,
	query: string,
	limit: number = SEARCH_RESULT_LIMIT
): Promise<SearchResults> => {
	const term = query.trim()
	if (!term) return emptyResults()

	const projectIds = await accessibleProjectIds(userId)
	if (projectIds.length === 0) return emptyResults()

	const contains = { contains: term, mode: "insensitive" as const }

	const [projects, media, comments] = await Promise.all([
		prisma.project.findMany({
			where: { id: { in: projectIds }, name: contains },
			select: { id: true, name: true },
			orderBy: { updatedAt: "desc" },
			take: limit,
		}),
		prisma.image.findMany({
			where: { projectId: { in: projectIds }, name: contains },
			select: {
				id: true,
				name: true,
				projectId: true,
				project: { select: { name: true } },
				versions: {
					orderBy: { versionNumber: "desc" },
					take: 1,
					select: { mediaType: true, thumbnailUrl: true },
				},
			},
			orderBy: { updatedAt: "desc" },
			take: limit,
		}),
		prisma.comment.findMany({
			where: {
				content: contains,
				imageVersion: { image: { projectId: { in: projectIds } } },
			},
			select: {
				id: true,
				content: true,
				createdAt: true,
				imageVersionId: true,
				user: { select: { name: true } },
				imageVersion: {
					select: {
						image: {
							select: {
								id: true,
								projectId: true,
								project: { select: { name: true } },
							},
						},
					},
				},
			},
			orderBy: { createdAt: "desc" },
			take: limit,
		}),
	])

	return {
		projects: projects.map((project) => ({
			id: project.id,
			label: project.name,
			projectId: project.id,
			projectName: project.name,
		})),
		media: media.map((image) => ({
			id: image.id,
			label: image.name,
			projectId: image.projectId,
			projectName: image.project.name,
			mediaType: image.versions[0]?.mediaType ?? "IMAGE",
			thumbnailUrl: image.versions[0]?.thumbnailUrl ?? null,
		})),
		comments: comments.map((comment) => ({
			id: comment.id,
			label: comment.content,
			projectId: comment.imageVersion.image.projectId,
			projectName: comment.imageVersion.image.project.name,
			imageId: comment.imageVersion.image.id,
			imageVersionId: comment.imageVersionId,
			authorName: comment.user.name,
			createdAt: comment.createdAt,
		})),
	}
}
