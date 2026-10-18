import { beforeEach, describe, expect, it, vi } from "vitest"

const emitMock = vi.fn()

vi.mock("../../lib/prisma", () => {
	const prisma = {
		imageVersion: { findUnique: vi.fn() },
		comment: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
		revisionCheck: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
		$executeRaw: vi.fn(),
		$transaction: vi.fn(),
	}
	prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma))
	return { prisma }
})

vi.mock("../../realtime/socket", () => ({
	io: { to: vi.fn(() => ({ emit: emitMock })) },
}))

vi.mock("../comments/comments.service", () => ({
	canSeeInternalComments: (role: string | null) => role === "EDITOR" || role === "OWNER",
	announceCommentUpdated: vi.fn(async () => undefined),
}))

import { prisma } from "../../lib/prisma"
import { io } from "../../realtime/socket"
import { announceCommentUpdated } from "../comments/comments.service"
import {
	clearRevisionCheck,
	getRevisionChecklist,
	recordRevisionCheck,
	summarise,
	toChecklistItem,
} from "./revision-check.service"

const mocked = vi.mocked(prisma, true)
const mockedAnnounce = vi.mocked(announceCommentUpdated)
const resolutionWrites = () =>
	mocked.comment.update.mock.calls.map(([args]) => (args as { data: { resolved: boolean } }).data.resolved)

const currentVersion = { id: "v3", imageId: "img", versionNumber: 3 }
const earlierComment = (overrides: Record<string, unknown> = {}) => ({
	id: "c1",
	userId: "author",
	resolved: false,
	internal: false,
	parentId: null,
	imageVersion: { imageId: "img", versionNumber: 1 },
	...overrides,
})

beforeEach(() => {
	vi.clearAllMocks()
	mocked.$transaction.mockImplementation((async (work: (tx: typeof mocked) => unknown) => work(mocked)) as never)
	mocked.imageVersion.findUnique.mockResolvedValue(currentVersion as never)
	mocked.comment.findUnique.mockImplementation((async (args: { select?: Record<string, unknown> }) =>
		args.select && Object.keys(args.select).length === 1 ? { resolved: currentResolved } : earlierComment({ resolved: currentResolved })) as never)
	mocked.revisionCheck.findUnique.mockResolvedValue(null)
	currentResolved = false
})

let currentResolved = false

const record = (overrides: Partial<Parameters<typeof recordRevisionCheck>[0]> = {}) =>
	recordRevisionCheck({
		versionId: "v3",
		commentId: "c1",
		userId: "author",
		role: "MEMBER",
		status: "FIXED",
		...overrides,
	})

describe("getRevisionChecklist", () => {
	it("asks for open top-level feedback from earlier versions of the same file, plus what was checked here", async () => {
		mocked.comment.findMany.mockResolvedValue([])

		await getRevisionChecklist("v3", "MEMBER")

		const where = mocked.comment.findMany.mock.calls[0][0]?.where
		expect(where).toMatchObject({
			parentId: null,
			imageVersion: { imageId: "img", versionNumber: { lt: 3 } },
			internal: false,
			OR: [{ resolved: false }, { revisionChecks: { some: { imageVersionId: "v3" } } }],
		})
	})

	it("includes internal notes for editors", async () => {
		mocked.comment.findMany.mockResolvedValue([])

		await getRevisionChecklist("v3", "EDITOR")

		expect(mocked.comment.findMany.mock.calls[0][0]?.where).not.toHaveProperty("internal")
	})
})

describe("toChecklistItem", () => {
	const row = {
		id: "c1",
		content: "Logo too small",
		userId: "author",
		resolved: false,
		internal: false,
		timestamp: 1.5,
		timestampEnd: null,
		page: null,
		modelAnchor: null,
		annotation: null,
		createdAt: new Date(),
		user: { id: "author", name: "Ada", email: "ada@example.com", avatarUrl: null },
		imageVersion: { id: "v1", versionName: "Version 1", versionNumber: 1 },
		revisionChecks: [
			{
				status: "NOT_FIXED",
				imageVersionId: "v2",
				updatedAt: new Date(),
				user: { id: "bo", name: "Bo", email: "bo@example.com", avatarUrl: null },
				imageVersion: { versionNumber: 2, versionName: "Version 2" },
			},
		],
	}

	it("never names a later version as where the feedback was still open", () => {
		expect(toChecklistItem(row as never, "v1x", 1).stillOpenOn).toBeNull()
	})

	it("remembers an earlier version where the feedback was still not fixed", () => {
		const item = toChecklistItem(row as never, "v3", 3)
		expect(item.check).toBeNull()
		expect(item.stillOpenOn).toEqual({ versionNumber: 2, versionName: "Version 2" })
	})

	it("counts fixed, still-open and unchecked items", () => {
		const unchecked = toChecklistItem(row as never, "v3", 3)
		const fixed = { ...unchecked, check: { status: "FIXED" as const, checkedBy: row.user, checkedAt: new Date() } }
		const open = { ...unchecked, check: { status: "NOT_FIXED" as const, checkedBy: row.user, checkedAt: new Date() } }
		expect(summarise([unchecked, fixed, open, fixed])).toEqual({
			total: 4,
			fixed: 2,
			notFixed: 1,
			unchecked: 1,
		})
	})
})

describe("recordRevisionCheck", () => {
	it("resolves the original feedback when its author confirms the fix", async () => {
		const result = await record()

		expect(result).toEqual({ status: "FIXED", resolved: true, previous: null })
		expect(resolutionWrites()).toEqual([true])
		expect(mockedAnnounce).toHaveBeenCalledWith("c1")
		expect(mocked.$executeRaw).toHaveBeenCalled()
		expect(mocked.revisionCheck.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ status: "FIXED", resolvedComment: true }),
			})
		)
		expect(io.to).toHaveBeenCalledWith("imageVersion:v3")
		expect(emitMock).toHaveBeenCalledWith("revision-check-updated", { versionId: "v3", commentId: "c1" })
	})

	it("lets an editor confirm someone else's feedback is fixed", async () => {
		await expect(record({ userId: "editor", role: "EDITOR" })).resolves.toMatchObject({ resolved: true })
	})

	it("refuses a fix confirmation from a reviewer who did not give the feedback", async () => {
		await expect(record({ userId: "someone", role: "MEMBER" })).rejects.toThrow(/confirm it is fixed/)
		expect(mocked.revisionCheck.upsert).not.toHaveBeenCalled()
	})

	it("lets any reviewer flag feedback as still not fixed without touching its resolution", async () => {
		const result = await record({ userId: "someone", status: "NOT_FIXED" })

		expect(result).toEqual({ status: "NOT_FIXED", resolved: false, previous: null })
		expect(resolutionWrites()).toEqual([])
	})

	it("reopens feedback that this version's check had resolved when its checker flags it again", async () => {
		currentResolved = true
		mocked.revisionCheck.findUnique.mockResolvedValue({
			status: "FIXED",
			resolvedComment: true,
			userId: "author",
		} as never)

		const result = await record({ status: "NOT_FIXED" })

		expect(result.resolved).toBe(false)
		expect(result.previous).toEqual({ status: "FIXED", checkedBy: "author" })
		expect(resolutionWrites()).toEqual([false])
	})

	it("refuses to let a reviewer overturn someone else's verdict", async () => {
		currentResolved = true
		mocked.revisionCheck.findUnique.mockResolvedValue({
			status: "FIXED",
			resolvedComment: true,
			userId: "editor",
		} as never)

		await expect(record({ userId: "someone", status: "NOT_FIXED" })).rejects.toThrow(/change this verdict/)
		expect(mocked.revisionCheck.upsert).not.toHaveBeenCalled()
		expect(resolutionWrites()).toEqual([])
	})

	it("lets an editor overturn someone else's verdict", async () => {
		currentResolved = true
		mocked.revisionCheck.findUnique.mockResolvedValue({
			status: "FIXED",
			resolvedComment: true,
			userId: "author",
		} as never)

		await expect(record({ userId: "ed", role: "EDITOR", status: "NOT_FIXED" })).resolves.toMatchObject({
			resolved: false,
		})
	})

	it("does not reopen feedback that was resolved some other way", async () => {
		currentResolved = true

		await record({ status: "NOT_FIXED" })

		expect(resolutionWrites()).toEqual([])
	})

	it("only checks feedback from an earlier version of the same file", async () => {
		mocked.comment.findUnique.mockResolvedValue(
			earlierComment({ imageVersion: { imageId: "other", versionNumber: 1 } }) as never
		)
		await expect(record()).rejects.toThrow(/earlier version/)

		mocked.comment.findUnique.mockResolvedValue(
			earlierComment({ imageVersion: { imageId: "img", versionNumber: 3 } }) as never
		)
		await expect(record()).rejects.toThrow(/earlier version/)
	})

	it("treats replies and hidden internal notes as not found", async () => {
		mocked.comment.findUnique.mockResolvedValue(earlierComment({ parentId: "p" }) as never)
		await expect(record()).rejects.toThrow(/earlier version/)

		mocked.comment.findUnique.mockResolvedValue(earlierComment({ internal: true }) as never)
		await expect(record({ status: "NOT_FIXED" })).rejects.toThrow(/earlier version/)
	})
})

describe("clearRevisionCheck", () => {
	it("undoes a fix confirmation and reopens the feedback it resolved", async () => {
		mocked.revisionCheck.findUnique.mockResolvedValue({
			status: "FIXED",
			resolvedComment: true,
			userId: "author",
		} as never)

		await expect(
			clearRevisionCheck({ versionId: "v3", commentId: "c1", userId: "author", role: "MEMBER" })
		).resolves.toEqual({ cleared: "FIXED" })
		expect(mocked.revisionCheck.delete).toHaveBeenCalled()
		expect(resolutionWrites()).toEqual([false])
		expect(mockedAnnounce).toHaveBeenCalledWith("c1")
	})

	it("refuses to undo someone else's check unless you are an editor", async () => {
		mocked.revisionCheck.findUnique.mockResolvedValue({
			status: "NOT_FIXED",
			resolvedComment: false,
			userId: "bo",
		} as never)

		await expect(
			clearRevisionCheck({ versionId: "v3", commentId: "c1", userId: "author", role: "MEMBER" })
		).rejects.toThrow(/undo/)
		await expect(
			clearRevisionCheck({ versionId: "v3", commentId: "c1", userId: "ed", role: "EDITOR" })
		).resolves.toEqual({ cleared: "NOT_FIXED" })
	})
})
