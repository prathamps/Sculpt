import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		project: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		projectMember: {
			delete: vi.fn(),
			findFirst: vi.fn(),
			create: vi.fn(),
		},
		user: {
			findUnique: vi.fn(),
		},
	},
}))

import { prisma } from "../../lib/prisma"
import {
	removeUserFromProject,
	updateProject,
	deleteProject,
	inviteUserToProject,
} from "./projects.service"
import { ForbiddenError } from "../../lib/errors"

const mocked = vi.mocked(prisma, true)

const projectWithMembers = (
	members: { id: string; userId: string; role: string }[]
) => ({ id: "p1", name: "Site", members })

describe("removeUserFromProject", () => {
	beforeEach(() => vi.clearAllMocks())

	it("refuses when the requester is not the project owner", async () => {
		mocked.project.findUnique.mockResolvedValue(
			projectWithMembers([
				{ id: "m1", userId: "owner", role: "OWNER" },
				{ id: "m2", userId: "member", role: "MEMBER" },
				{ id: "m3", userId: "victim", role: "MEMBER" },
			]) as never
		)

		await expect(
			removeUserFromProject("p1", "victim", "member")
		).rejects.toThrow("Only project owners can remove members.")
		expect(mocked.projectMember.delete).not.toHaveBeenCalled()
	})

	it("refuses to remove the project owner", async () => {
		mocked.project.findUnique.mockResolvedValue(
			projectWithMembers([
				{ id: "m1", userId: "owner", role: "OWNER" },
			]) as never
		)

		await expect(removeUserFromProject("p1", "owner", "owner")).rejects.toThrow(
			"Cannot remove the project owner."
		)
	})

	it("removes exactly the targeted membership when the owner asks", async () => {
		mocked.project.findUnique.mockResolvedValue(
			projectWithMembers([
				{ id: "m1", userId: "owner", role: "OWNER" },
				{ id: "m2", userId: "member", role: "MEMBER" },
			]) as never
		)

		await removeUserFromProject("p1", "member", "owner")

		expect(mocked.projectMember.delete).toHaveBeenCalledWith({
			where: { id: "m2" },
		})
	})
})

describe("updateProject", () => {
	beforeEach(() => vi.clearAllMocks())

	it("only lets owners rename a project", async () => {
		mocked.project.findFirst.mockResolvedValue(null)

		await expect(
			updateProject("p1", { name: "New" }, "not-owner")
		).rejects.toThrow("Project not found or user not authorized")
		expect(mocked.project.update).not.toHaveBeenCalled()
	})

	it("scopes the ownership check to the acting user", async () => {
		mocked.project.findFirst.mockResolvedValue({ id: "p1" } as never)
		mocked.project.update.mockResolvedValue({ id: "p1", name: "New" } as never)

		await updateProject("p1", { name: "New" }, "owner")

		expect(mocked.project.findFirst).toHaveBeenCalledWith({
			where: {
				id: "p1",
				members: { some: { userId: "owner", role: "OWNER" } },
			},
		})
	})
})

describe("deleteProject", () => {
	beforeEach(() => vi.clearAllMocks())

	it("refuses when the user does not own the project", async () => {
		mocked.project.findFirst.mockResolvedValue(null)

		await expect(deleteProject("p1", "someone")).rejects.toThrow(
			"Project not found or user not authorized"
		)
		expect(mocked.project.delete).not.toHaveBeenCalled()
	})
})

describe("inviteUserToProject", () => {
	beforeEach(() => vi.clearAllMocks())

	it("refuses when the requester is not the project owner", async () => {
		mocked.projectMember.findFirst.mockResolvedValue(null)

		await expect(
			inviteUserToProject("p1", "victim@example.com", "not-owner")
		).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.user.findUnique).not.toHaveBeenCalled()
		expect(mocked.projectMember.create).not.toHaveBeenCalled()
	})

	it("adds the invitee as a member when an owner invites", async () => {
		mocked.projectMember.findFirst.mockResolvedValue({ id: "m1" } as never)
		mocked.user.findUnique.mockResolvedValue({ id: "invitee" } as never)
		mocked.project.findUnique.mockResolvedValue({ id: "p1" } as never)

		await inviteUserToProject("p1", "invitee@example.com", "owner")

		expect(mocked.projectMember.create).toHaveBeenCalledWith({
			data: { projectId: "p1", userId: "invitee", role: "MEMBER" },
		})
	})
})
