import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../lib/presence", () => ({
	markOnline: vi.fn().mockResolvedValue(undefined),
	markOffline: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../modules/projects/access", () => ({
	canViewVersion: vi.fn(),
	isProjectMember: vi.fn(),
}))

vi.mock("../lib/logger", () => ({
	logger: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}))

vi.mock("./viewerPresence", () => ({
	addViewer: vi.fn(),
	updateViewer: vi.fn(),
	removeViewer: vi.fn(),
	getViewers: vi.fn(() => []),
}))

import { Socket } from "socket.io"
import { canViewVersion, isProjectMember } from "../modules/projects/access"
import { markOnline } from "../lib/presence"
import { logger } from "../lib/logger"
import { registerHandlers } from "./socket"

const mockedAccess = vi.mocked({ canViewVersion, isProjectMember })
const mockedMarkOnline = vi.mocked(markOnline)

interface FakeSocket {
	socket: Socket
	fire: (event: string, payload?: unknown) => Promise<void>
	joined: string[]
	emitted: { event: string; payload: unknown }[]
}

const fakeSocket = (user: unknown): FakeSocket => {
	const handlers = new Map<string, (payload?: unknown) => unknown>()
	const joined: string[] = []
	const emitted: { event: string; payload: unknown }[] = []

	const socket = {
		id: "socket-1",
		data: { user },
		rooms: new Set<string>(),
		on: (event: string, handler: (payload?: unknown) => unknown) => {
			handlers.set(event, handler)
		},
		join: (room: string) => {
			joined.push(room)
		},
		leave: vi.fn(),
		emit: (event: string, payload: unknown) => {
			emitted.push({ event, payload })
		},
		to: () => ({ emit: vi.fn() }),
		volatile: { to: () => ({ emit: vi.fn() }) },
	} as unknown as Socket

	registerHandlers(socket)

	return {
		socket,
		joined,
		emitted,
		fire: async (event, payload) => {
			await handlers.get(event)?.(payload)
		},
	}
}

const member = { id: "u1", name: "Ada", email: "ada@example.com", avatarUrl: null }

beforeEach(() => {
	vi.clearAllMocks()
})

describe("join", () => {
	it("joins the room for the authenticated session, never a client-supplied id", async () => {
		const fake = fakeSocket(member)

		await fake.fire("join", "victim-user-id")

		expect(fake.joined).toEqual(["user:u1"])
		expect(mockedMarkOnline).toHaveBeenCalledWith("u1", "socket-1")
	})

	it("joins nothing when the socket carries no identity", async () => {
		const fake = fakeSocket(null)

		await fake.fire("join", "victim-user-id")

		expect(fake.joined).toEqual([])
		expect(mockedMarkOnline).not.toHaveBeenCalled()
	})
})

describe("joinProject", () => {
	it("denies a project room to a non-member", async () => {
		mockedAccess.isProjectMember.mockResolvedValue(false)
		const fake = fakeSocket(member)

		await fake.fire("joinProject", "p1")

		expect(fake.joined).toEqual([])
		expect(fake.emitted).toEqual([
			{ event: "project_join_denied", payload: { projectId: "p1" } },
		])
	})

	it("admits a member to the project room", async () => {
		mockedAccess.isProjectMember.mockResolvedValue(true)
		const fake = fakeSocket(member)

		await fake.fire("joinProject", "p1")

		expect(mockedAccess.isProjectMember).toHaveBeenCalledWith("p1", "u1")
		expect(fake.joined).toEqual(["project:p1"])
	})

	it("logs instead of crashing when the membership check rejects", async () => {
		mockedAccess.isProjectMember.mockRejectedValue(new Error("db down"))
		const fake = fakeSocket(member)

		await expect(fake.fire("joinProject", "p1")).resolves.toBeUndefined()

		expect(fake.joined).toEqual([])
		expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
			"socket handler failed",
			expect.any(Error),
			{ event: "joinProject" }
		)
	})

	it("ignores a non-string project id", async () => {
		const fake = fakeSocket(member)

		await fake.fire("joinProject", { projectId: "p1" })

		expect(fake.joined).toEqual([])
		expect(mockedAccess.isProjectMember).not.toHaveBeenCalled()
	})
})

describe("joinImageVersion", () => {
	it("denies a version room when the user cannot view it", async () => {
		mockedAccess.canViewVersion.mockResolvedValue(false)
		const fake = fakeSocket(member)

		await fake.fire("joinImageVersion", "v1")

		expect(fake.joined).toEqual([])
		expect(fake.emitted).toEqual([
			{ event: "image_version_join_denied", payload: { imageVersionId: "v1" } },
		])
	})

	it("admits a viewer to the version room", async () => {
		mockedAccess.canViewVersion.mockResolvedValue(true)
		const fake = fakeSocket(member)

		await fake.fire("joinImageVersion", "v1")

		expect(fake.joined).toEqual(["imageVersion:v1"])
	})

	it("logs instead of crashing when the view check rejects", async () => {
		mockedAccess.canViewVersion.mockRejectedValue(new Error("db down"))
		const fake = fakeSocket(member)

		await expect(fake.fire("joinImageVersion", "v1")).resolves.toBeUndefined()

		expect(fake.joined).toEqual([])
		expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
			"socket handler failed",
			expect.any(Error),
			{ event: "joinImageVersion" }
		)
	})
})
