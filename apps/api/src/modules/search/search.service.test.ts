import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		projectMember: { findMany: vi.fn() },
		project: { findMany: vi.fn() },
		image: { findMany: vi.fn() },
		comment: { findMany: vi.fn() },
	},
}))

import { prisma } from "../../lib/prisma"
import { searchForUser } from "./search.service"

const mocked = vi.mocked(prisma, true)

const memberOf = (...projectIds: string[]) =>
	mocked.projectMember.findMany.mockResolvedValue(
		projectIds.map((projectId) => ({ projectId, role: "OWNER" })) as never
	)

beforeEach(() => {
	vi.clearAllMocks()
	mocked.project.findMany.mockResolvedValue([] as never)
	mocked.image.findMany.mockResolvedValue([] as never)
	mocked.comment.findMany.mockResolvedValue([] as never)
})

describe("searchForUser", () => {
	it("returns nothing for a blank term without querying", async () => {
		const results = await searchForUser("u1", "   ")

		expect(results).toEqual({ projects: [], media: [], comments: [] })
		expect(mocked.projectMember.findMany).not.toHaveBeenCalled()
	})

	it("returns nothing when the user belongs to no projects", async () => {
		memberOf()

		const results = await searchForUser("u1", "logo")

		expect(results).toEqual({ projects: [], media: [], comments: [] })
		expect(mocked.image.findMany).not.toHaveBeenCalled()
	})

	it("scopes every query to the caller's own projects", async () => {
		memberOf("p1", "p2")

		await searchForUser("u1", "logo")

		const projectWhere = mocked.project.findMany.mock.calls[0][0].where
		const imageWhere = mocked.image.findMany.mock.calls[0][0].where
		const commentWhere = mocked.comment.findMany.mock.calls[0][0].where

		expect(projectWhere.id).toEqual({ in: ["p1", "p2"] })
		expect(imageWhere.projectId).toEqual({ in: ["p1", "p2"] })
		expect(commentWhere.imageVersion.image).toEqual({
			projectId: { in: ["p1", "p2"] },
		})
	})

	it("searches case-insensitively across file and version names", async () => {
		memberOf("p1")

		await searchForUser("u1", "LoGo")

		const insensitive = { contains: "LoGo", mode: "insensitive" }
		expect(mocked.image.findMany.mock.calls[0][0].where.OR).toEqual([
			{ name: insensitive },
			{ versions: { some: { versionName: insensitive } } },
		])
	})

	it("hides internal comments from projects where the caller is not on the team", async () => {
		mocked.projectMember.findMany.mockResolvedValue([
			{ projectId: "p1", role: "MEMBER" },
			{ projectId: "p2", role: "EDITOR" },
		] as never)

		await searchForUser("u1", "logo")

		expect(mocked.comment.findMany.mock.calls[0][0].where.OR).toEqual([
			{ internal: false },
			{
				internal: true,
				imageVersion: { image: { projectId: { in: ["p2"] } } },
			},
		])
	})

	it("narrows media and comments by media type", async () => {
		memberOf("p1")

		await searchForUser("u1", "logo", 20, { mediaType: "VIDEO" })

		expect(mocked.image.findMany.mock.calls[0][0].where.versions).toEqual({
			some: { mediaType: "VIDEO" },
		})
		expect(
			mocked.comment.findMany.mock.calls[0][0].where.imageVersion.mediaType
		).toBe("VIDEO")
	})

	it("narrows results by review status", async () => {
		memberOf("p1")

		await searchForUser("u1", "logo", 20, { reviewStatus: "APPROVED" })

		expect(mocked.image.findMany.mock.calls[0][0].where.versions).toEqual({
			some: { reviewStatus: "APPROVED" },
		})
	})

	it("drops project hits when a media filter is active", async () => {
		memberOf("p1")

		const results = await searchForUser("u1", "logo", 20, {
			mediaType: "IMAGE",
		})

		expect(mocked.project.findMany).not.toHaveBeenCalled()
		expect(results.projects).toEqual([])
	})

	it("caps each result set at the requested limit", async () => {
		memberOf("p1")

		await searchForUser("u1", "logo", 5)

		expect(mocked.project.findMany.mock.calls[0][0].take).toBe(5)
		expect(mocked.image.findMany.mock.calls[0][0].take).toBe(5)
		expect(mocked.comment.findMany.mock.calls[0][0].take).toBe(5)
	})

	it("flattens media hits with their project and latest media type", async () => {
		memberOf("p1")
		mocked.image.findMany.mockResolvedValue([
			{
				id: "img1",
				name: "logo.png",
				projectId: "p1",
				project: { name: "Rebrand" },
				versions: [{ mediaType: "IMAGE", thumbnailUrl: "uploads/t.jpg" }],
			},
		] as never)

		const results = await searchForUser("u1", "logo")

		expect(results.media).toEqual([
			{
				id: "img1",
				label: "logo.png",
				projectId: "p1",
				projectName: "Rebrand",
				mediaType: "IMAGE",
				thumbnailUrl: "uploads/t.jpg",
			},
		])
	})

	it("keeps comment hits addressable back to their media", async () => {
		memberOf("p1")
		const createdAt = new Date("2026-01-01T00:00:00Z")
		mocked.comment.findMany.mockResolvedValue([
			{
				id: "c1",
				content: "the logo is too small",
				createdAt,
				imageVersionId: "v1",
				user: { name: "Ada" },
				imageVersion: {
					image: { id: "img1", projectId: "p1", project: { name: "Rebrand" } },
				},
			},
		] as never)

		const results = await searchForUser("u1", "logo")

		expect(results.comments[0]).toEqual({
			id: "c1",
			label: "the logo is too small",
			projectId: "p1",
			projectName: "Rebrand",
			imageId: "img1",
			imageVersionId: "v1",
			authorName: "Ada",
			createdAt,
		})
	})
})
