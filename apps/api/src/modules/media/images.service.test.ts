import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		$transaction: vi.fn(),
		image: {
			create: vi.fn(),
			findUnique: vi.fn(),
			delete: vi.fn(),
		},
		imageVersion: {
			create: vi.fn(),
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			count: vi.fn(),
			delete: vi.fn(),
		},
		mediaAsset: {
			createMany: vi.fn(),
			deleteMany: vi.fn(),
			findUnique: vi.fn(),
		},
	},
}))

vi.mock("../../storage", () => ({
	storage: {
		store: vi.fn(),
		remove: vi.fn(),
	},
}))

import { Prisma } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { storage } from "../../storage"
import {
	addImagesToProject,
	addImageVersion,
	deleteImage,
	deleteImageVersion,
} from "./images.service"

const mocked = vi.mocked(prisma, true)
const mockedStorage = vi.mocked(storage, true)

const versionNumberConflict = () =>
	new Prisma.PrismaClientKnownRequestError("unique violation", {
		code: "P2002",
		clientVersion: "test",
	})

beforeEach(() => {
	vi.clearAllMocks()
	mocked.$transaction.mockImplementation(async (arg: unknown) =>
		typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg
	)
})

describe("addImagesToProject", () => {
	it("persists mediaType, duration and thumbnailUrl on the first version", async () => {
		mocked.image.create.mockResolvedValue({ versions: [] } as never)

		await addImagesToProject([
			{
				url: "uploads/a.mp4",
				name: "a.mp4",
				projectId: "p1",
				mediaType: "VIDEO",
				duration: 12.4,
				thumbnailUrl: "uploads/a-thumb.jpg",
			},
		])

		expect(mocked.image.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					versions: {
						create: expect.objectContaining({
							mediaType: "VIDEO",
							duration: 12.4,
							thumbnailUrl: "uploads/a-thumb.jpg",
						}),
					},
				}),
			})
		)
	})

	it("creates every image inside one transaction so a failure leaves no orphan rows", async () => {
		mocked.image.create.mockResolvedValue({ versions: [] } as never)

		await addImagesToProject([
			{ url: "uploads/a.png", name: "a.png", projectId: "p1" },
			{ url: "uploads/b.png", name: "b.png", projectId: "p1" },
		])

		expect(mocked.$transaction).toHaveBeenCalledTimes(1)
		expect(mocked.image.create).toHaveBeenCalledTimes(2)
	})

	it("records asset ownership so media stays authorized", async () => {
		mocked.image.create.mockResolvedValue({
			versions: [
				{ url: "uploads/a.png", thumbnailUrl: "uploads/a-t.jpg", proxyUrl: null },
			],
		} as never)

		await addImagesToProject([
			{ url: "uploads/a.png", name: "a.png", projectId: "p1" },
		])

		expect(mocked.mediaAsset.createMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: [
					{ storedPath: "a.png", projectId: "p1" },
					{ storedPath: "a-t.jpg", projectId: "p1" },
				],
				skipDuplicates: true,
			})
		)
	})
})

describe("addImageVersion", () => {
	it("increments the version number and defaults the name", async () => {
		mocked.imageVersion.findFirst.mockResolvedValue({
			versionNumber: 3,
		} as never)
		mocked.imageVersion.create.mockResolvedValue({
			url: "uploads/b.pdf",
			thumbnailUrl: null,
			proxyUrl: null,
			image: { projectId: "p1" },
		} as never)

		await addImageVersion("img1", "uploads/b.pdf", {
			mediaType: "PDF",
			thumbnailUrl: "uploads/b-thumb.jpg",
		})

		expect(mocked.imageVersion.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					versionName: "Version 4",
					versionNumber: 4,
					mediaType: "PDF",
					thumbnailUrl: "uploads/b-thumb.jpg",
				}),
			})
		)
	})

	it("retries with a fresh number when two uploads race for the same version", async () => {
		mocked.imageVersion.findFirst
			.mockResolvedValueOnce({ versionNumber: 1 } as never)
			.mockResolvedValueOnce({ versionNumber: 2 } as never)
		mocked.imageVersion.create
			.mockRejectedValueOnce(versionNumberConflict())
			.mockResolvedValueOnce({
				url: "uploads/c.png",
				thumbnailUrl: null,
				proxyUrl: null,
				image: { projectId: "p1" },
			} as never)

		await addImageVersion("img1", "uploads/c.png")

		expect(mocked.imageVersion.create).toHaveBeenCalledTimes(2)
		const secondAttempt = mocked.imageVersion.create.mock.calls[1][0] as {
			data: { versionNumber: number }
		}
		expect(secondAttempt.data.versionNumber).toBe(3)
	})

	it("gives up with a clear error when the race never resolves", async () => {
		mocked.imageVersion.findFirst.mockResolvedValue({
			versionNumber: 1,
		} as never)
		mocked.imageVersion.create.mockRejectedValue(versionNumberConflict())

		await expect(addImageVersion("img1", "uploads/d.png")).rejects.toThrow(
			/at the same time/i
		)
	})

	it("propagates errors that are not version-number conflicts", async () => {
		mocked.imageVersion.findFirst.mockResolvedValue(null)
		mocked.imageVersion.create.mockRejectedValue(new Error("database is down"))

		await expect(addImageVersion("img1", "uploads/e.png")).rejects.toThrow(
			"database is down"
		)
		expect(mocked.imageVersion.create).toHaveBeenCalledTimes(1)
	})
})

describe("deleteImage", () => {
	it("removes every version file and its thumbnail when present", async () => {
		mocked.image.findUnique.mockResolvedValue({
			id: "img1",
			versions: [
				{ url: "uploads/v1.png", thumbnailUrl: null },
				{ url: "uploads/v2.mp4", thumbnailUrl: "uploads/v2-thumb.jpg" },
			],
		} as never)
		mocked.image.delete.mockResolvedValue({} as never)

		await deleteImage("img1")

		expect(mockedStorage.remove).toHaveBeenCalledTimes(3)
		expect(mockedStorage.remove).toHaveBeenCalledWith("uploads/v1.png")
		expect(mockedStorage.remove).toHaveBeenCalledWith("uploads/v2.mp4")
		expect(mockedStorage.remove).toHaveBeenCalledWith("uploads/v2-thumb.jpg")
	})

	it("forgets asset ownership so the paths stop resolving", async () => {
		mocked.image.findUnique.mockResolvedValue({
			id: "img1",
			versions: [{ url: "uploads/v1.png", thumbnailUrl: null }],
		} as never)
		mocked.image.delete.mockResolvedValue({} as never)

		await deleteImage("img1")

		expect(mocked.mediaAsset.deleteMany).toHaveBeenCalledWith({
			where: { storedPath: { in: ["v1.png"] } },
		})
	})
})

describe("deleteImageVersion", () => {
	it("refuses to delete the only version", async () => {
		mocked.imageVersion.findUnique.mockResolvedValue({
			id: "v1",
			imageId: "img1",
			url: "uploads/v1.png",
			thumbnailUrl: null,
		} as never)
		mocked.imageVersion.count.mockResolvedValue(1)

		await expect(deleteImageVersion("v1")).rejects.toThrow(
			"Cannot delete the only version of an image"
		)
		expect(mocked.imageVersion.delete).not.toHaveBeenCalled()
	})

	it("removes the file and its thumbnail", async () => {
		mocked.imageVersion.findUnique.mockResolvedValue({
			id: "v2",
			imageId: "img1",
			url: "uploads/v2.mp4",
			thumbnailUrl: "uploads/v2-thumb.jpg",
		} as never)
		mocked.imageVersion.count.mockResolvedValue(2)
		mocked.imageVersion.delete.mockResolvedValue({} as never)

		await deleteImageVersion("v2")

		expect(mockedStorage.remove).toHaveBeenCalledWith("uploads/v2.mp4")
		expect(mockedStorage.remove).toHaveBeenCalledWith("uploads/v2-thumb.jpg")
	})
})
