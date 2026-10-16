import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../lib/presence", () => ({
	markOnline: vi.fn().mockResolvedValue(undefined),
	markOffline: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../modules/projects/access", () => ({
	canViewVersion: vi.fn(),
	canViewInternalComments: vi.fn().mockResolvedValue(false),
	isProjectMember: vi.fn(),
}))

vi.mock("./socketAuth", () => ({
	resolveSocketUser: vi.fn(),
	socketAuth: vi.fn(),
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
	addViewer: vi.fn().mockResolvedValue(undefined),
	updateViewer: vi.fn().mockResolvedValue(true),
	removeViewer: vi.fn().mockResolvedValue(undefined),
	getViewers: vi.fn().mockResolvedValue([]),
	refreshViewerTtls: vi.fn().mockResolvedValue(undefined),
}))

import { Socket } from "socket.io"
import {
	canViewInternalComments,
	canViewVersion,
	isProjectMember,
} from "../modules/projects/access"
import { markOnline } from "../lib/presence"
import { logger } from "../lib/logger"
import { resolveSocketUser } from "./socketAuth"
import { registerHandlers, revalidateSocketAccess } from "./socket"

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
			socket.rooms.add(room)
		},
		leave: vi.fn((room: string) => {
			socket.rooms.delete(room)
		}),
		emit: (event: string, payload: unknown) => {
			emitted.push({ event, payload })
		},
		to: () => ({ emit: vi.fn() }),
		volatile: { to: () => ({ emit: vi.fn() }) },
		disconnect: vi.fn(),
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

describe("revalidateSocketAccess", () => {
	const mockedResolve = vi.mocked(resolveSocketUser)
	const mockedInternal = vi.mocked(canViewInternalComments)

	it("disconnects a socket whose session no longer verifies", async () => {
		mockedResolve.mockResolvedValue(null)
		const fake = fakeSocket(member)

		const stillValid = await revalidateSocketAccess(fake.socket)

		expect(stillValid).toBe(false)
		expect(fake.socket.disconnect).toHaveBeenCalledWith(true)
		expect(fake.emitted.map((e) => e.event)).toContain("session_expired")
	})

	it("drops a project room once membership is revoked", async () => {
		mockedAccess.isProjectMember.mockResolvedValue(true)
		const fake = fakeSocket(member)
		await fake.fire("joinProject", "p1")

		mockedResolve.mockResolvedValue(member)
		mockedAccess.isProjectMember.mockResolvedValue(false)

		await revalidateSocketAccess(fake.socket)

		expect(fake.socket.leave).toHaveBeenCalledWith("project:p1")
		expect(fake.emitted.map((e) => e.event)).toContain(
			"project_access_revoked"
		)
	})

	it("drops a version room once the viewer loses access", async () => {
		mockedAccess.canViewVersion.mockResolvedValue(true)
		const fake = fakeSocket(member)
		await fake.fire("joinImageVersion", "v1")

		mockedResolve.mockResolvedValue(member)
		mockedAccess.canViewVersion.mockResolvedValue(false)

		await revalidateSocketAccess(fake.socket)

		expect(fake.socket.leave).toHaveBeenCalledWith("imageVersion:v1")
		expect(fake.emitted.map((e) => e.event)).toContain(
			"image_version_access_revoked"
		)
	})

	it("leaves the internal room when a demotion removes that access", async () => {
		mockedAccess.canViewVersion.mockResolvedValue(true)
		mockedInternal.mockResolvedValue(true)
		const fake = fakeSocket(member)
		await fake.fire("joinImageVersion", "v1")
		expect(fake.joined).toContain("imageVersion:v1:internal")

		mockedResolve.mockResolvedValue(member)
		mockedInternal.mockResolvedValue(false)

		await revalidateSocketAccess(fake.socket)

		expect(fake.socket.leave).toHaveBeenCalledWith("imageVersion:v1:internal")
	})

	it("keeps a still-authorized socket connected", async () => {
		mockedAccess.canViewVersion.mockResolvedValue(true)
		mockedAccess.isProjectMember.mockResolvedValue(true)
		mockedInternal.mockResolvedValue(false)
		const fake = fakeSocket(member)
		await fake.fire("joinProject", "p1")
		await fake.fire("joinImageVersion", "v1")

		mockedResolve.mockResolvedValue(member)

		expect(await revalidateSocketAccess(fake.socket)).toBe(true)
		expect(fake.socket.disconnect).not.toHaveBeenCalled()
	})
})
