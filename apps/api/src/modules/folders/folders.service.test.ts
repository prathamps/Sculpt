import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../lib/prisma", () => ({
	prisma: {
		folder: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		image: {
			findFirst: vi.fn(),
			update: vi.fn(),
		},
	},
}))

import { prisma } from "../../lib/prisma"
import { NotFoundError, ValidationError } from "../../lib/errors"
import {
	createFolder,
	folderPath,
	moveFolder,
	moveImageToFolder,
	renameFolder,
} from "./folders.service"

const mocked = vi.mocked(prisma, true)

const folder = (id: string, parentId: string | null) => ({
	id,
	name: `folder-${id}`,
	parentId,
	projectId: "p1",
})

beforeEach(() => vi.clearAllMocks())

describe("moveFolder", () => {
	it("refuses to nest a folder inside itself", async () => {
		mocked.folder.findFirst.mockResolvedValue(folder("f1", null) as never)

		await expect(moveFolder("f1", "p1", "f1")).rejects.toBeInstanceOf(
			ValidationError
		)
		expect(mocked.folder.update).not.toHaveBeenCalled()
	})

	it("refuses to nest a folder inside its own descendant", async () => {
		mocked.folder.findFirst
			.mockResolvedValueOnce(folder("f1", null) as never)
			.mockResolvedValueOnce(folder("f3", "f2") as never)
			.mockResolvedValueOnce({ parentId: "f2" } as never)
			.mockResolvedValueOnce({ parentId: "f1" } as never)

		await expect(moveFolder("f1", "p1", "f3")).rejects.toBeInstanceOf(
			ValidationError
		)
		expect(mocked.folder.update).not.toHaveBeenCalled()
	})

	it("moves a folder to a valid parent", async () => {
		mocked.folder.findFirst
			.mockResolvedValueOnce(folder("f1", null) as never)
			.mockResolvedValueOnce(folder("f2", null) as never)
			.mockResolvedValueOnce({ parentId: null } as never)
			.mockResolvedValueOnce(null)
		mocked.folder.update.mockResolvedValue(folder("f1", "f2") as never)

		await moveFolder("f1", "p1", "f2")

		expect(mocked.folder.update).toHaveBeenCalledWith({
			where: { id: "f1" },
			data: { parentId: "f2" },
		})
	})

	it("moves a folder to the project root", async () => {
		mocked.folder.findFirst
			.mockResolvedValueOnce(folder("f1", "f2") as never)
			.mockResolvedValueOnce(null)
		mocked.folder.update.mockResolvedValue(folder("f1", null) as never)

		await moveFolder("f1", "p1", null)

		expect(mocked.folder.update).toHaveBeenCalledWith({
			where: { id: "f1" },
			data: { parentId: null },
		})
	})

	it("refuses a move that would collide with a name at the destination", async () => {
		mocked.folder.findFirst
			.mockResolvedValueOnce(folder("f1", "f9") as never)
			.mockResolvedValueOnce({ id: "existing" } as never)

		await expect(moveFolder("f1", "p1", null)).rejects.toBeInstanceOf(
			ValidationError
		)
		expect(mocked.folder.update).not.toHaveBeenCalled()
	})

	it("rejects a folder from another project", async () => {
		mocked.folder.findFirst.mockResolvedValue(null)

		await expect(moveFolder("f1", "p1", null)).rejects.toBeInstanceOf(
			NotFoundError
		)
	})
})

describe("folderPath", () => {
	it("returns the trail from the root down to the folder", async () => {
		mocked.folder.findFirst
			.mockResolvedValueOnce(folder("child", "parent") as never)
			.mockResolvedValueOnce(folder("parent", "root") as never)
			.mockResolvedValueOnce(folder("root", null) as never)

		expect(await folderPath("child", "p1")).toEqual([
			{ id: "root", name: "folder-root" },
			{ id: "parent", name: "folder-parent" },
			{ id: "child", name: "folder-child" },
		])
	})
})

describe("createFolder", () => {
	it("refuses a duplicate name at the project root, which the NULL parent unique index misses", async () => {
		mocked.folder.findFirst.mockResolvedValue({ id: "existing" } as never)

		await expect(createFolder("p1", "Shots", null)).rejects.toBeInstanceOf(
			ValidationError
		)
		expect(mocked.folder.create).not.toHaveBeenCalled()
	})

	it("creates a folder when the name is free", async () => {
		mocked.folder.findFirst.mockResolvedValue(null)
		mocked.folder.create.mockResolvedValue(folder("new", null) as never)

		await createFolder("p1", "Shots", null)

		expect(mocked.folder.create).toHaveBeenCalledWith({
			data: { projectId: "p1", name: "Shots", parentId: null },
		})
	})
})

describe("renameFolder", () => {
	it("rejects an unknown folder before updating", async () => {
		mocked.folder.findFirst.mockResolvedValue(null)

		await expect(renameFolder("ghost", "p1", "New")).rejects.toBeInstanceOf(
			NotFoundError
		)
		expect(mocked.folder.update).not.toHaveBeenCalled()
	})

	it("rejects a rename that collides with a sibling", async () => {
		mocked.folder.findFirst
			.mockResolvedValueOnce(folder("f1", null) as never)
			.mockResolvedValueOnce({ id: "sibling" } as never)

		await expect(renameFolder("f1", "p1", "Taken")).rejects.toBeInstanceOf(
			ValidationError
		)
		expect(mocked.folder.update).not.toHaveBeenCalled()
	})
})

describe("moveImageToFolder", () => {
	it("refuses an image that is not in the project", async () => {
		mocked.image.findFirst.mockResolvedValue(null)

		await expect(
			moveImageToFolder("img1", "p1", null)
		).rejects.toBeInstanceOf(NotFoundError)
		expect(mocked.image.update).not.toHaveBeenCalled()
	})

	it("refuses a destination folder from another project", async () => {
		mocked.image.findFirst.mockResolvedValue({ id: "img1" } as never)
		mocked.folder.findFirst.mockResolvedValue(null)

		await expect(
			moveImageToFolder("img1", "p1", "other-project-folder")
		).rejects.toBeInstanceOf(NotFoundError)
		expect(mocked.image.update).not.toHaveBeenCalled()
	})
})
