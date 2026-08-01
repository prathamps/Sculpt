import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		$transaction: vi.fn(),
		project: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		projectMember: {
			delete: vi.fn(),
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			count: vi.fn(),
		},
		projectInvitation: {
			upsert: vi.fn(),
		},
		shareLink: {
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
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
	changeMemberRole,
	joinProjectWithShareLink,
	createShareLink,
} from "./projects.service"
import { ForbiddenError, ValidationError } from "../../lib/errors"

const mocked = vi.mocked(prisma, true)

const ownerMembership = { id: "m-owner", role: "OWNER" }

const actingAsOwner = () =>
	mocked.projectMember.findFirst.mockResolvedValue(ownerMembership as never)

const actingAsNonOwner = () =>
	mocked.projectMember.findFirst.mockResolvedValue(null)

beforeEach(() => {
	vi.clearAllMocks()
	mocked.$transaction.mockImplementation(async (arg: unknown) =>
		typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg
	)
})

describe("removeUserFromProject", () => {
	it("refuses when the requester is not the project owner", async () => {
		actingAsNonOwner()

		await expect(
			removeUserFromProject("p1", "victim", "member")
		).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.projectMember.delete).not.toHaveBeenCalled()
	})

	it("refuses to remove the project owner", async () => {
		actingAsOwner()
		mocked.projectMember.findUnique.mockResolvedValue({
			id: "m1",
			role: "OWNER",
		} as never)

		await expect(
			removeUserFromProject("p1", "owner", "owner")
		).rejects.toBeInstanceOf(ValidationError)
		expect(mocked.projectMember.delete).not.toHaveBeenCalled()
	})

	it("removes exactly the targeted membership when the owner asks", async () => {
		actingAsOwner()
		mocked.projectMember.findUnique.mockResolvedValue({
			id: "m2",
			role: "MEMBER",
		} as never)

		await removeUserFromProject("p1", "member", "owner")

		expect(mocked.projectMember.delete).toHaveBeenCalledWith({
			where: { id: "m2" },
		})
	})
})

describe("changeMemberRole", () => {
	it("refuses when the requester is not an owner", async () => {
		actingAsNonOwner()

		await expect(
			changeMemberRole("p1", "member", "EDITOR", "member")
		).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.projectMember.update).not.toHaveBeenCalled()
	})

	it("refuses to demote the last remaining owner", async () => {
		actingAsOwner()
		mocked.projectMember.findUnique.mockResolvedValue({
			id: "m1",
			role: "OWNER",
		} as never)
		mocked.projectMember.count.mockResolvedValue(1 as never)

		await expect(
			changeMemberRole("p1", "owner", "VIEWER", "owner")
		).rejects.toThrow(/at least one owner/i)
		expect(mocked.projectMember.update).not.toHaveBeenCalled()
	})

	it("allows demoting an owner when another owner remains", async () => {
		actingAsOwner()
		mocked.projectMember.findUnique.mockResolvedValue({
			id: "m1",
			role: "OWNER",
		} as never)
		mocked.projectMember.count.mockResolvedValue(2 as never)

		await changeMemberRole("p1", "owner", "VIEWER", "other-owner")

		expect(mocked.projectMember.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { role: "VIEWER" },
		})
	})
})

describe("updateProject", () => {
	it("only lets owners rename a project", async () => {
		actingAsNonOwner()

		await expect(
			updateProject("p1", { name: "New" }, "not-owner")
		).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.project.update).not.toHaveBeenCalled()
	})

	it("scopes the ownership check to the acting user", async () => {
		actingAsOwner()
		mocked.project.update.mockResolvedValue({ id: "p1", name: "New" } as never)

		await updateProject("p1", { name: "New" }, "owner")

		expect(mocked.projectMember.findFirst).toHaveBeenCalledWith({
			where: { projectId: "p1", userId: "owner", role: "OWNER" },
			select: { id: true },
		})
	})
})

describe("deleteProject", () => {
	it("refuses when the user does not own the project", async () => {
		actingAsNonOwner()

		await expect(deleteProject("p1", "someone")).rejects.toBeInstanceOf(
			ForbiddenError
		)
		expect(mocked.project.delete).not.toHaveBeenCalled()
	})
})

describe("inviteUserToProject", () => {
	it("refuses when the requester is not the project owner", async () => {
		actingAsNonOwner()

		await expect(
			inviteUserToProject("p1", "victim@example.com", "not-owner")
		).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.user.findUnique).not.toHaveBeenCalled()
		expect(mocked.projectMember.create).not.toHaveBeenCalled()
	})

	it("refuses to grant OWNER through an invitation", async () => {
		actingAsOwner()

		await expect(
			inviteUserToProject("p1", "invitee@example.com", "owner", "OWNER")
		).rejects.toBeInstanceOf(ValidationError)
	})

	it("adds an existing user as a member directly", async () => {
		actingAsOwner()
		mocked.user.findUnique.mockResolvedValue({ id: "invitee" } as never)
		mocked.projectMember.findUnique.mockResolvedValue(null)

		const result = await inviteUserToProject(
			"p1",
			"Invitee@Example.com ",
			"owner"
		)

		expect(result.invitedExistingUser).toBe(true)
		expect(result.email).toBe("invitee@example.com")
		expect(mocked.projectMember.create).toHaveBeenCalledWith({
			data: { projectId: "p1", userId: "invitee", role: "MEMBER" },
		})
	})

	it("rejects inviting someone who is already a member", async () => {
		actingAsOwner()
		mocked.user.findUnique.mockResolvedValue({ id: "invitee" } as never)
		mocked.projectMember.findUnique.mockResolvedValue({ id: "m9" } as never)

		await expect(
			inviteUserToProject("p1", "invitee@example.com", "owner")
		).rejects.toBeInstanceOf(ValidationError)
	})

	it("creates a pending invitation with a token for an unregistered email", async () => {
		actingAsOwner()
		mocked.user.findUnique.mockResolvedValue(null)

		const result = await inviteUserToProject(
			"p1",
			"stranger@example.com",
			"owner",
			"VIEWER"
		)

		expect(result.invitedExistingUser).toBe(false)
		expect(result.token).toMatch(/^[a-f0-9]{64}$/)
		expect(mocked.projectMember.create).not.toHaveBeenCalled()
		expect(mocked.projectInvitation.upsert).toHaveBeenCalled()
	})

	it("stores only a hash of the invitation token", async () => {
		actingAsOwner()
		mocked.user.findUnique.mockResolvedValue(null)

		const result = await inviteUserToProject(
			"p1",
			"stranger@example.com",
			"owner"
		)

		const call = mocked.projectInvitation.upsert.mock.calls[0][0] as {
			create: { tokenHash: string }
		}
		expect(call.create.tokenHash).not.toBe(result.token)
		expect(call.create.tokenHash).toMatch(/^[a-f0-9]{64}$/)
	})
})

describe("createShareLink", () => {
	it("refuses to mint an OWNER share link", async () => {
		actingAsOwner()

		await expect(
			createShareLink("p1", "owner", { role: "OWNER" })
		).rejects.toBeInstanceOf(ValidationError)
		expect(mocked.shareLink.create).not.toHaveBeenCalled()
	})

	it("stores an expiry when one is requested", async () => {
		actingAsOwner()
		mocked.shareLink.create.mockResolvedValue({ id: "l1" } as never)

		await createShareLink("p1", "owner", { role: "VIEWER", expiresInDays: 7 })

		const call = mocked.shareLink.create.mock.calls[0][0] as {
			data: { expiresAt: Date | null; maxUses: number | null }
		}
		expect(call.data.expiresAt).toBeInstanceOf(Date)
	})
})

describe("joinProjectWithShareLink", () => {
	const usableLink = {
		id: "l1",
		projectId: "p1",
		role: "VIEWER",
		revokedAt: null,
		expiresAt: null,
		maxUses: null,
		useCount: 0,
	}

	it("rejects a revoked link", async () => {
		mocked.shareLink.findUnique.mockResolvedValue({
			...usableLink,
			revokedAt: new Date(),
		} as never)

		await expect(joinProjectWithShareLink("t", "u1")).rejects.toThrow(
			/invalid, expired or used up/i
		)
	})

	it("rejects an expired link", async () => {
		mocked.shareLink.findUnique.mockResolvedValue({
			...usableLink,
			expiresAt: new Date(Date.now() - 1000),
		} as never)

		await expect(joinProjectWithShareLink("t", "u1")).rejects.toThrow(
			/invalid, expired or used up/i
		)
	})

	it("rejects a link that has hit its use limit", async () => {
		mocked.shareLink.findUnique.mockResolvedValue({
			...usableLink,
			maxUses: 2,
			useCount: 2,
		} as never)

		await expect(joinProjectWithShareLink("t", "u1")).rejects.toThrow(
			/invalid, expired or used up/i
		)
	})

	it("adds a brand new member and counts the use", async () => {
		mocked.shareLink.findUnique.mockResolvedValue(usableLink as never)
		mocked.projectMember.findFirst.mockResolvedValue(null)
		mocked.project.findUnique.mockResolvedValue({ id: "p1" } as never)

		await joinProjectWithShareLink("t", "u1")

		expect(mocked.projectMember.create).toHaveBeenCalledWith({
			data: { projectId: "p1", userId: "u1", role: "VIEWER" },
		})
		expect(mocked.shareLink.update).toHaveBeenCalledWith({
			where: { id: "l1" },
			data: { useCount: { increment: 1 } },
		})
	})

	it("never demotes an existing member to the link's lower role", async () => {
		mocked.shareLink.findUnique.mockResolvedValue(usableLink as never)
		mocked.projectMember.findFirst.mockResolvedValue({ role: "OWNER" } as never)
		mocked.project.findUnique.mockResolvedValue({ id: "p1" } as never)

		await joinProjectWithShareLink("t", "owner")

		expect(mocked.projectMember.update).not.toHaveBeenCalled()
		expect(mocked.projectMember.create).not.toHaveBeenCalled()
	})

	it("promotes an existing member when the link grants more access", async () => {
		mocked.shareLink.findUnique.mockResolvedValue({
			...usableLink,
			role: "EDITOR",
		} as never)
		mocked.projectMember.findFirst.mockResolvedValue({ role: "VIEWER" } as never)
		mocked.project.findUnique.mockResolvedValue({ id: "p1" } as never)

		await joinProjectWithShareLink("t", "u1")

		expect(mocked.projectMember.update).toHaveBeenCalledWith({
			where: { projectId_userId: { projectId: "p1", userId: "u1" } },
			data: { role: "EDITOR" },
		})
	})
})
