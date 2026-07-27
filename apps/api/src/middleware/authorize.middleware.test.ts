import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../modules/projects/access", () => ({
	getMemberRole: vi.fn(),
	getImageProjectId: vi.fn(),
	getVersionProjectId: vi.fn(),
	getCommentProjectId: vi.fn(),
	roleMeets: vi.fn(),
}))

import { Request, Response } from "express"
import {
	getCommentProjectId,
	getImageProjectId,
	getMemberRole,
	getVersionProjectId,
	roleMeets,
} from "../modules/projects/access"
import {
	authorizedScope,
	projectIdFromCommentParam,
	projectIdFromImageParam,
	projectIdFromParam,
	projectIdFromVersionParam,
	requireProjectRole,
} from "./authorize.middleware"

const mocked = vi.mocked({
	getMemberRole,
	getImageProjectId,
	getVersionProjectId,
	getCommentProjectId,
	roleMeets,
})

const fakeRequest = (params: Record<string, string>, userId?: string) =>
	({
		params,
		...(userId ? { user: { id: userId } } : {}),
	}) as unknown as Request

const fakeResponse = () => {
	const res = {
		locals: {} as Record<string, unknown>,
		statusCode: 0,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code
			return this
		},
		json(payload: unknown) {
			this.body = payload
			return this
		},
	}
	return res as unknown as Response & {
		statusCode: number
		body: { message?: string }
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	mocked.roleMeets.mockReturnValue(true)
})

describe("requireProjectRole", () => {
	it("rejects an unauthenticated caller before touching the database", async () => {
		const res = fakeResponse()
		const next = vi.fn()

		await requireProjectRole("VIEWER", projectIdFromParam())(
			fakeRequest({ projectId: "p1" }),
			res,
			next
		)

		expect(res.statusCode).toBe(401)
		expect(next).not.toHaveBeenCalled()
		expect(mocked.getMemberRole).not.toHaveBeenCalled()
	})

	it("returns 404 when the resource does not resolve to a project", async () => {
		const res = fakeResponse()
		const next = vi.fn()

		await requireProjectRole("VIEWER", () => null)(
			fakeRequest({}, "u1"),
			res,
			next
		)

		expect(res.statusCode).toBe(404)
		expect(next).not.toHaveBeenCalled()
	})

	it("returns 403 for a non-member", async () => {
		mocked.getMemberRole.mockResolvedValue(null)
		const res = fakeResponse()
		const next = vi.fn()

		await requireProjectRole("VIEWER", projectIdFromParam())(
			fakeRequest({ projectId: "p1" }, "u1"),
			res,
			next
		)

		expect(res.statusCode).toBe(403)
		expect(res.body.message).toMatch(/not a member/i)
		expect(next).not.toHaveBeenCalled()
	})

	it("returns 403 when the member's role is below the minimum", async () => {
		mocked.getMemberRole.mockResolvedValue("VIEWER")
		mocked.roleMeets.mockReturnValue(false)
		const res = fakeResponse()
		const next = vi.fn()

		await requireProjectRole("EDITOR", projectIdFromParam())(
			fakeRequest({ projectId: "p1" }, "u1"),
			res,
			next
		)

		expect(res.statusCode).toBe(403)
		expect(mocked.roleMeets).toHaveBeenCalledWith("VIEWER", "EDITOR")
		expect(next).not.toHaveBeenCalled()
	})

	it("publishes the resolved scope to the handler on success", async () => {
		mocked.getMemberRole.mockResolvedValue("EDITOR")
		const res = fakeResponse()
		const next = vi.fn()

		await requireProjectRole("EDITOR", projectIdFromParam())(
			fakeRequest({ projectId: "p1" }, "u1"),
			res,
			next
		)

		expect(next).toHaveBeenCalledWith()
		expect(authorizedScope(res)).toEqual({
			userId: "u1",
			projectId: "p1",
			role: "EDITOR",
		})
	})
})

describe("project id resolvers", () => {
	it("resolves a project through an image id", async () => {
		mocked.getImageProjectId.mockResolvedValue("p-from-image")

		const resolved = await projectIdFromImageParam("id")(
			fakeRequest({ id: "img1" }, "u1")
		)

		expect(mocked.getImageProjectId).toHaveBeenCalledWith("img1")
		expect(resolved).toBe("p-from-image")
	})

	it("resolves a project through a version id", async () => {
		mocked.getVersionProjectId.mockResolvedValue("p-from-version")

		const resolved = await projectIdFromVersionParam("versionId")(
			fakeRequest({ versionId: "v1" }, "u1")
		)

		expect(resolved).toBe("p-from-version")
	})

	it("resolves a project through a comment id", async () => {
		mocked.getCommentProjectId.mockResolvedValue("p-from-comment")

		const resolved = await projectIdFromCommentParam()(
			fakeRequest({ commentId: "c1" }, "u1")
		)

		expect(resolved).toBe("p-from-comment")
	})
})

describe("authorizedScope", () => {
	it("throws loudly when a route forgot its authorization middleware", () => {
		expect(() => authorizedScope(fakeResponse())).toThrow(
			/requireProjectRole/
		)
	})
})
