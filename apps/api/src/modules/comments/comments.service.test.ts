import { describe, expect, it, vi, beforeEach } from "vitest"

const emitMock = vi.fn()

vi.mock("../../lib/prisma", () => ({
	prisma: {
		comment: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			create: vi.fn(),
		},
		imageVersion: {
			findUnique: vi.fn(),
		},
		image: {
			findUnique: vi.fn(),
		},
		projectMember: {
			findMany: vi.fn(),
		},
		commentAttachment: {
			createMany: vi.fn(),
			findMany: vi.fn(),
		},
	},
}))

vi.mock("../projects/access", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../projects/access")>()
	return {
		...actual,
		getVersionProjectId: vi.fn(),
	}
})

vi.mock("../../realtime/socket", () => ({
	io: { to: vi.fn(() => ({ emit: emitMock })) },
	internalVersionRoom: (imageVersionId: string) =>
		`imageVersion:${imageVersionId}:internal`,
}))

vi.mock("../notifications/notification.service", () => ({
	NotificationService: {
		createNotification: vi.fn(),
		createProjectNotification: vi.fn(),
	},
}))

import { prisma } from "../../lib/prisma"
import { io } from "../../realtime/socket"
import { getVersionProjectId } from "../projects/access"
import { NotificationService } from "../notifications/notification.service"
import { CommentsService } from "./comments.service"
import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"

const mocked = vi.mocked(prisma, true)

describe("CommentsService.createComment anchors", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocked.comment.create.mockResolvedValue({
			id: "c1",
			imageVersionId: "v1",
			parentId: null,
			user: { name: "A" },
		} as never)
		mocked.image.findUnique.mockResolvedValue(null)
	})

	const mockVersion = (
		mediaType: "IMAGE" | "VIDEO" | "PDF" | "MODEL",
		duration: number | null = null
	) =>
		mocked.imageVersion.findUnique.mockResolvedValue({
			mediaType,
			duration,
		} as never)

	const create = (anchors: {
		timestamp?: number | null
		timestampEnd?: number | null
		page?: number | null
		modelAnchor?: unknown
	}) =>
		CommentsService.createComment({
			content: "hi",
			imageVersionId: "v1",
			userId: "u1",
			...anchors,
		})

	it("rejects comments on unknown versions", async () => {
		mocked.imageVersion.findUnique.mockResolvedValue(null)
		await expect(create({})).rejects.toBeInstanceOf(NotFoundError)
	})

	it("rejects a range end before its start", async () => {
		mockVersion("VIDEO", 60)
		await expect(
			create({ timestamp: 10, timestampEnd: 5 })
		).rejects.toBeInstanceOf(ValidationError)
	})

	it("rejects a range end without a start", async () => {
		mockVersion("VIDEO", 60)
		await expect(create({ timestampEnd: 5 })).rejects.toBeInstanceOf(
			ValidationError
		)
	})

	it("rejects negative and non-finite timestamps", async () => {
		mockVersion("VIDEO", 60)
		await expect(create({ timestamp: -1 })).rejects.toBeInstanceOf(
			ValidationError
		)
		await expect(create({ timestamp: NaN })).rejects.toBeInstanceOf(
			ValidationError
		)
	})

	it("clamps timestamps to the known duration", async () => {
		mockVersion("VIDEO", 30)
		await create({ timestamp: 25, timestampEnd: 45 })
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ timestamp: 25, timestampEnd: 30 }),
			})
		)
	})

	it("accepts a range when duration is unknown", async () => {
		mockVersion("VIDEO", null)
		await create({ timestamp: 5, timestampEnd: 12 })
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ timestamp: 5, timestampEnd: 12 }),
			})
		)
	})

	it("nulls timestamps on image versions and page on video versions", async () => {
		mockVersion("IMAGE")
		await create({ timestamp: 5, timestampEnd: 10, page: 2 })
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					timestamp: null,
					timestampEnd: null,
					page: null,
				}),
			})
		)

		mockVersion("VIDEO", 60)
		await create({ timestamp: 5, page: 2 })
		expect(mocked.comment.create).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ timestamp: 5, page: null }),
			})
		)
	})

	it("persists page for PDF versions and rejects invalid pages", async () => {
		mockVersion("PDF")
		await create({ page: 3 })
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ page: 3 }),
			})
		)
		await expect(create({ page: 0 })).rejects.toBeInstanceOf(ValidationError)
		await expect(create({ page: 1.5 })).rejects.toBeInstanceOf(
			ValidationError
		)
	})

	it("persists a valid model anchor for MODEL versions and strips unknown keys", async () => {
		mockVersion("MODEL")
		await create({
			modelAnchor: {
				position: [1, 2, 3],
				normal: [0, 1, 0],
				camera: { position: [4, 5, 6], target: [0, 0, 0] },
				extra: "dropped",
			},
		})
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					modelAnchor: {
						position: [1, 2, 3],
						normal: [0, 1, 0],
						camera: { position: [4, 5, 6], target: [0, 0, 0] },
					},
				}),
			})
		)
	})

	it("accepts a model anchor with only a position", async () => {
		mockVersion("MODEL")
		await create({ modelAnchor: { position: [0.5, -1, 2] } })
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					modelAnchor: { position: [0.5, -1, 2] },
				}),
			})
		)
	})

	it("rejects malformed model anchors", async () => {
		mockVersion("MODEL")
		await expect(create({ modelAnchor: "pin" })).rejects.toBeInstanceOf(
			ValidationError
		)
		await expect(create({ modelAnchor: {} })).rejects.toBeInstanceOf(
			ValidationError
		)
		await expect(
			create({ modelAnchor: { position: [1, 2] } })
		).rejects.toBeInstanceOf(ValidationError)
		await expect(
			create({ modelAnchor: { position: [1, 2, NaN] } })
		).rejects.toBeInstanceOf(ValidationError)
		await expect(
			create({ modelAnchor: { position: [1, 2, 3], normal: [1, "a", 0] } })
		).rejects.toBeInstanceOf(ValidationError)
		await expect(
			create({
				modelAnchor: { position: [1, 2, 3], camera: { position: [1, 2, 3] } },
			})
		).rejects.toBeInstanceOf(ValidationError)
	})

	it("drops model anchors on non-MODEL versions and other anchors on MODEL versions", async () => {
		mockVersion("IMAGE")
		await create({ modelAnchor: { position: [1, 2, 3] } })
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ modelAnchor: undefined }),
			})
		)

		mockVersion("MODEL")
		await create({ timestamp: 5, timestampEnd: 10, page: 2 })
		expect(mocked.comment.create).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					timestamp: null,
					timestampEnd: null,
					page: null,
					modelAnchor: undefined,
				}),
			})
		)
	})

	it("emits the new comment to the version room", async () => {
		mockVersion("VIDEO", 60)
		await create({ timestamp: 5, timestampEnd: 9 })
		expect(io.to).toHaveBeenCalledWith("imageVersion:v1")
		expect(emitMock).toHaveBeenCalledWith(
			"new-comment",
			expect.objectContaining({ id: "c1" })
		)
	})
})

describe("CommentsService.createComment mentions", () => {
	const mockedAccess = vi.mocked(getVersionProjectId)
	const mockedNotifications = vi.mocked(NotificationService, true)

	beforeEach(() => {
		vi.clearAllMocks()
		mockedNotifications.createNotification.mockResolvedValue({} as never)
		mockedNotifications.createProjectNotification.mockResolvedValue(undefined)
		mocked.comment.create.mockResolvedValue({
			id: "c1",
			imageVersionId: "v1",
			parentId: null,
			user: { name: "Ada" },
		} as never)
		mocked.imageVersion.findUnique.mockResolvedValue({
			mediaType: "IMAGE",
			duration: null,
			imageId: "img1",
		} as never)
		mocked.image.findUnique.mockResolvedValue({
			projectId: "p1",
			name: "hero.png",
		} as never)
		mockedAccess.mockResolvedValue("p1")
		mocked.projectMember.findMany.mockResolvedValue([
			{ userId: "member1" },
		] as never)
	})

	const createWithMentions = (mentionedUserIds: string[]) =>
		CommentsService.createComment({
			content: "hi @Member",
			imageVersionId: "v1",
			userId: "u1",
			mentionedUserIds,
		})

	it("stores only project members, never the author", async () => {
		await createWithMentions(["u1", "member1", "stranger", "member1"])

		expect(mocked.projectMember.findMany).toHaveBeenCalledWith({
			where: { projectId: "p1", userId: { in: ["member1", "stranger"] } },
			select: { userId: true },
		})
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					mentions: { create: [{ userId: "member1" }] },
				}),
			})
		)
	})

	it("notifies mentioned members and excludes them from the project fan-out", async () => {
		await createWithMentions(["member1"])

		expect(mockedNotifications.createNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "member1",
				metadata: expect.objectContaining({ type: "mention" }),
			})
		)
		expect(mockedNotifications.createProjectNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				excludeUserIds: ["u1", "member1"],
			})
		)
	})

	it("skips membership lookup entirely without mentions", async () => {
		await createWithMentions([])

		expect(mocked.projectMember.findMany).not.toHaveBeenCalled()
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ mentions: { create: [] } }),
			})
		)
	})

	it("does not double-notify a mentioned parent author on a reply", async () => {
		mocked.comment.findUnique.mockResolvedValue({
			imageVersionId: "v1",
			userId: "parent-author",
		} as never)
		mocked.comment.create.mockResolvedValue({
			id: "c2",
			imageVersionId: "v1",
			parentId: "c1",
			user: { name: "Ada" },
		} as never)
		mocked.projectMember.findMany.mockResolvedValue([
			{ userId: "parent-author" },
		] as never)

		await CommentsService.createComment({
			content: "hi",
			imageVersionId: "v1",
			userId: "u1",
			parentId: "c1",
			mentionedUserIds: ["parent-author"],
		})

		const contents = mockedNotifications.createNotification.mock.calls.map(
			(call) => call[0].content
		)
		expect(contents).toContain("Ada mentioned you in a comment")
		expect(contents.some((text) => text.includes("replied"))).toBe(false)
	})
})

describe("CommentsService.createComment parent threading", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocked.comment.create.mockResolvedValue({
			id: "c1",
			imageVersionId: "v1",
			parentId: "p1",
			user: { name: "A" },
		} as never)
		mocked.image.findUnique.mockResolvedValue(null)
		mocked.imageVersion.findUnique.mockResolvedValue({
			mediaType: "IMAGE",
			duration: null,
		} as never)
	})

	const createReply = (parentId: string) =>
		CommentsService.createComment({
			content: "hi",
			imageVersionId: "v1",
			userId: "u1",
			parentId,
		})

	it("rejects a parent that belongs to another image version", async () => {
		mocked.comment.findUnique.mockResolvedValue({
			imageVersionId: "other-version",
		} as never)

		await expect(createReply("p1")).rejects.toBeInstanceOf(NotFoundError)
		expect(mocked.comment.create).not.toHaveBeenCalled()
	})

	it("rejects an unknown parent", async () => {
		mocked.comment.findUnique.mockResolvedValue(null)

		await expect(createReply("ghost")).rejects.toBeInstanceOf(NotFoundError)
		expect(mocked.comment.create).not.toHaveBeenCalled()
	})

	it("accepts a parent from the same image version", async () => {
		mocked.comment.findUnique.mockResolvedValue({
			imageVersionId: "v1",
			userId: "author",
		} as never)

		await createReply("p1")

		expect(mocked.comment.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: "p1" } })
		)
		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ parentId: "p1" }),
			})
		)
	})
})

describe("CommentsService internal comments", () => {
	const mockedAccess = vi.mocked(getVersionProjectId)
	const mockedNotifications = vi.mocked(NotificationService, true)

	beforeEach(() => {
		vi.clearAllMocks()
		mockedNotifications.createNotification.mockResolvedValue({} as never)
		mockedNotifications.createProjectNotification.mockResolvedValue(undefined)
		mocked.imageVersion.findUnique.mockResolvedValue({
			mediaType: "IMAGE",
			duration: null,
			imageId: "img1",
		} as never)
		mocked.image.findUnique.mockResolvedValue({
			projectId: "p1",
			name: "hero.png",
		} as never)
		mockedAccess.mockResolvedValue("p1")
		mocked.comment.create.mockResolvedValue({
			id: "c1",
			imageVersionId: "v1",
			parentId: null,
			internal: true,
			user: { name: "Ada" },
		} as never)
	})

	const post = (internal: boolean, authorRole: "VIEWER" | "MEMBER" | "EDITOR") =>
		CommentsService.createComment({
			content: "internal note",
			imageVersionId: "v1",
			userId: "u1",
			internal,
			authorRole,
		})

	it("refuses an internal comment from a member below EDITOR", async () => {
		await expect(post(true, "MEMBER")).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.comment.create).not.toHaveBeenCalled()
	})

	it("stores an internal comment for an editor", async () => {
		await post(true, "EDITOR")

		expect(mocked.comment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ internal: true }),
			})
		)
	})

	it("fans an internal comment out only to the internal roles", async () => {
		await post(true, "EDITOR")

		expect(mockedNotifications.createProjectNotification).toHaveBeenCalledWith(
			expect.objectContaining({ onlyRoles: ["EDITOR", "OWNER"] })
		)
	})

	it("emits an internal comment to the internal room only", async () => {
		await post(true, "EDITOR")

		expect(io.to).toHaveBeenCalledWith("imageVersion:v1:internal")
		expect(io.to).not.toHaveBeenCalledWith("imageVersion:v1")
	})

	it("hides internal comments from readers below EDITOR", async () => {
		mocked.comment.findMany.mockResolvedValue([] as never)

		await CommentsService.getCommentsByImageVersionId("v1", "u1", "MEMBER")

		expect(mocked.comment.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { imageVersionId: "v1", parentId: null, internal: false },
			})
		)
	})

	it("shows internal comments to editors", async () => {
		mocked.comment.findMany.mockResolvedValue([] as never)

		await CommentsService.getCommentsByImageVersionId("v1", "u1", "EDITOR")

		expect(mocked.comment.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { imageVersionId: "v1", parentId: null },
			})
		)
	})
})

describe("CommentsService.attachToComment", () => {
	const file = {
		url: "uploads/ref.png",
		fileName: "ref.png",
		mimeType: "image/png",
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mocked.commentAttachment.findMany.mockResolvedValue([file] as never)
	})

	const existing = (attachments: number, userId = "author") => ({
		userId,
		imageVersionId: "v1",
		internal: false,
		_count: { attachments },
	})

	it("rejects an unknown comment", async () => {
		mocked.comment.findUnique.mockResolvedValue(null)

		await expect(
			CommentsService.attachToComment("ghost", "author", [file])
		).rejects.toBeInstanceOf(NotFoundError)
	})

	it("lets only the author attach files", async () => {
		mocked.comment.findUnique.mockResolvedValue(existing(0) as never)

		await expect(
			CommentsService.attachToComment("c1", "someone-else", [file])
		).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.commentAttachment.createMany).not.toHaveBeenCalled()
	})

	it("refuses to exceed the per-comment attachment cap", async () => {
		mocked.comment.findUnique.mockResolvedValue(existing(2) as never)

		await expect(
			CommentsService.attachToComment("c1", "author", [file, file])
		).rejects.toBeInstanceOf(ValidationError)
		expect(mocked.commentAttachment.createMany).not.toHaveBeenCalled()
	})

	it("stores attachments and announces them to the thread", async () => {
		mocked.comment.findUnique.mockResolvedValue(existing(0) as never)

		const result = await CommentsService.attachToComment("c1", "author", [file])

		expect(mocked.commentAttachment.createMany).toHaveBeenCalledWith({
			data: [{ ...file, commentId: "c1" }],
		})
		expect(result).toEqual([file])
		expect(emitMock).toHaveBeenCalledWith(
			"comment-updated",
			expect.objectContaining({ id: "c1", attachments: [file] })
		)
	})

	it("keeps internal attachments in the internal room", async () => {
		mocked.comment.findUnique.mockResolvedValue({
			...existing(0),
			internal: true,
		} as never)

		await CommentsService.attachToComment("c1", "author", [file])

		expect(io.to).toHaveBeenCalledWith("imageVersion:v1:internal")
	})
})

describe("CommentsService.toggleResolved", () => {
	beforeEach(() => vi.clearAllMocks())

	it("rejects unknown comments", async () => {
		mocked.comment.findUnique.mockResolvedValue(null)

		await expect(
			CommentsService.toggleResolved("missing", "user1")
		).rejects.toBeInstanceOf(NotFoundError)
	})

	it("only lets the author resolve their comment", async () => {
		mocked.comment.findUnique.mockResolvedValue({
			userId: "author",
			resolved: false,
			imageVersionId: "v1",
		} as never)

		await expect(
			CommentsService.toggleResolved("c1", "someone-else")
		).rejects.toBeInstanceOf(ForbiddenError)
		expect(mocked.comment.update).not.toHaveBeenCalled()
	})

	it("toggles the flag and notifies the image version room", async () => {
		mocked.comment.findUnique.mockResolvedValue({
			userId: "author",
			resolved: false,
			imageVersionId: "v1",
		} as never)
		mocked.comment.update.mockResolvedValue({
			id: "c1",
			resolved: true,
		} as never)

		const result = await CommentsService.toggleResolved("c1", "author")

		expect(result).toEqual({ resolved: true })
		expect(mocked.comment.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { resolved: true } })
		)
		expect(io.to).toHaveBeenCalledWith("imageVersion:v1")
		expect(emitMock).toHaveBeenCalledWith(
			"comment-updated",
			expect.objectContaining({ id: "c1", imageVersionId: "v1" })
		)
	})
})
