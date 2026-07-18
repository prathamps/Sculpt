import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
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
	},
}))

vi.mock("../../storage", () => ({
	storage: {
		store: vi.fn(),
		remove: vi.fn(),
	},
}))

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

beforeEach(() => vi.clearAllMocks())

describe("addImagesToProject", () => {
	it("persists mediaType, duration and thumbnailUrl on the first version", async () => {
		mocked.image.create.mockResolvedValue({} as never)

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
})

describe("addImageVersion", () => {
	it("increments the version number and defaults the name", async () => {
		mocked.imageVersion.findFirst.mockResolvedValue({
			versionNumber: 3,
		} as never)
		mocked.imageVersion.create.mockResolvedValue({} as never)

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
