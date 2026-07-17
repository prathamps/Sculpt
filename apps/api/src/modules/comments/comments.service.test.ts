import { describe, expect, it, vi, beforeEach } from "vitest"

const emitMock = vi.fn()

vi.mock("../../lib/prisma", () => ({
	prisma: {
		comment: {
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
}))

vi.mock("../../realtime/socket", () => ({
	io: { to: vi.fn(() => ({ emit: emitMock })) },
}))

vi.mock("../notifications/notification.service", () => ({
	NotificationService: {},
}))

import { prisma } from "../../lib/prisma"
import { io } from "../../realtime/socket"
import { CommentsService } from "./comments.service"
import { ForbiddenError, NotFoundError } from "../../lib/errors"

const mocked = vi.mocked(prisma, true)

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
