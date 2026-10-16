import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		projectMember: { findFirst: vi.fn() },
		imageVersion: { findUnique: vi.fn() },
	},
}))

import { prisma } from "../../lib/prisma"
import {
	canViewVersion,
	clearAccessCaches,
	forgetMembership,
	getMemberRole,
	roleMeets,
} from "./access"

const mocked = vi.mocked(prisma, true)

describe("roleMeets", () => {
	it("grants a role everything its lower ranks grant", () => {
		expect(roleMeets("OWNER", "VIEWER")).toBe(true)
		expect(roleMeets("OWNER", "EDITOR")).toBe(true)
		expect(roleMeets("EDITOR", "MEMBER")).toBe(true)
		expect(roleMeets("MEMBER", "VIEWER")).toBe(true)
	})

	it("denies actions above a role's rank", () => {
		expect(roleMeets("VIEWER", "MEMBER")).toBe(false)
		expect(roleMeets("MEMBER", "EDITOR")).toBe(false)
		expect(roleMeets("EDITOR", "OWNER")).toBe(false)
	})

	it("treats a non-member (null role) as denied", () => {
		expect(roleMeets(null, "VIEWER")).toBe(false)
	})

	it("allows a role to meet its own rank", () => {
		expect(roleMeets("MEMBER", "MEMBER")).toBe(true)
		expect(roleMeets("VIEWER", "VIEWER")).toBe(true)
	})
})

describe("canViewVersion", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		clearAccessCaches()
	})

	it("denies when the version does not exist", async () => {
		mocked.imageVersion.findUnique.mockResolvedValue(null)
		expect(await canViewVersion("u1", "missing")).toBe(false)
	})

	it("denies non-members of the owning project", async () => {
		mocked.imageVersion.findUnique.mockResolvedValue({
			image: { projectId: "p1" },
		} as never)
		mocked.projectMember.findFirst.mockResolvedValue(null)
		expect(await canViewVersion("stranger", "v1")).toBe(false)
	})

	it("allows any member role, including VIEWER", async () => {
		mocked.imageVersion.findUnique.mockResolvedValue({
			image: { projectId: "p1" },
		} as never)
		mocked.projectMember.findFirst.mockResolvedValue({
			role: "VIEWER",
		} as never)
		expect(await canViewVersion("member", "v1")).toBe(true)
	})
})

describe("membership caching", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		clearAccessCaches()
	})

	it("answers repeated checks for the same member from one lookup", async () => {
		mocked.projectMember.findFirst.mockResolvedValue({ role: "EDITOR" } as never)

		await getMemberRole("p1", "u1")
		await getMemberRole("p1", "u1")

		expect(mocked.projectMember.findFirst).toHaveBeenCalledTimes(1)
	})

	it("sees a removal immediately once the membership is forgotten", async () => {
		mocked.projectMember.findFirst.mockResolvedValueOnce({ role: "EDITOR" } as never)
		await getMemberRole("p1", "u1")

		forgetMembership("p1", "u1")
		mocked.projectMember.findFirst.mockResolvedValueOnce(null)

		expect(await getMemberRole("p1", "u1")).toBeNull()
	})

	it("forgets every member of a deleted project", async () => {
		mocked.projectMember.findFirst.mockResolvedValue({ role: "OWNER" } as never)
		await getMemberRole("p1", "u1")
		await getMemberRole("p1", "u2")

		forgetMembership("p1")
		await getMemberRole("p1", "u1")
		await getMemberRole("p1", "u2")

		expect(mocked.projectMember.findFirst).toHaveBeenCalledTimes(4)
	})
})
