import { describe, expect, it, vi } from "vitest"

vi.mock("../lib/redis", () => {
	const hashes = new Map<string, Map<string, string>>()
	const roomOf = (key: string) => {
		let room = hashes.get(key)
		if (!room) {
			room = new Map()
			hashes.set(key, room)
		}
		return room
	}
	return {
		default: {
			hSet: vi.fn(async (key: string, field: string, value: string) => {
				roomOf(key).set(field, value)
				return 1
			}),
			hDel: vi.fn(async (key: string, field: string) => {
				roomOf(key).delete(field)
				return 1
			}),
			hVals: vi.fn(async (key: string) => Array.from(roomOf(key).values())),
			expire: vi.fn(async () => 1),
		},
	}
})

import {
	addViewer,
	updateViewer,
	removeViewer,
	getViewers,
} from "./viewerPresence"

const user = (id: string) => ({ id, name: id, avatarUrl: null })

const socketIds = async (imageVersionId: string): Promise<string[]> =>
	(await getViewers(imageVersionId)).map((viewer) => viewer.socketId).sort()

describe("viewerPresence", () => {
	it("tracks viewers per version and per socket", async () => {
		await addViewer("v1", "s1", user("alice"))
		await addViewer("v1", "s2", user("bob"))
		await addViewer("v2", "s3", user("alice"))

		expect(await socketIds("v1")).toEqual(["s1", "s2"])
		expect(await getViewers("v2")).toHaveLength(1)

		await removeViewer("v1", "s1")
		await removeViewer("v1", "s2")
		await removeViewer("v2", "s3")
	})

	it("supports the same user in multiple tabs", async () => {
		await addViewer("v3", "tab1", user("alice"))
		await addViewer("v3", "tab2", user("alice"))

		expect(await getViewers("v3")).toHaveLength(2)

		await removeViewer("v3", "tab1")
		expect(await getViewers("v3")).toHaveLength(1)
		await removeViewer("v3", "tab2")
		expect(await getViewers("v3")).toHaveLength(0)
	})

	it("updates playhead time only for known viewers", async () => {
		await addViewer("v4", "s1", user("alice"))

		expect(await updateViewer("v4", "s1", 12.5)).toBe(true)
		expect((await getViewers("v4"))[0].time).toBe(12.5)
		expect(await updateViewer("v4", "ghost", 3)).toBe(false)
		expect(await updateViewer("missing", "s1", 3)).toBe(false)

		await removeViewer("v4", "s1")
	})

	it("ignores removals of unknown viewers", async () => {
		await expect(removeViewer("nope", "s9")).resolves.toBeUndefined()
	})

	it("reports viewers that only another instance published", async () => {
		await addViewer("v5", "local", user("alice"))

		const redis = (await import("../lib/redis")).default
		await redis.hSet(
			"viewers:v5",
			"remote",
			JSON.stringify({
				socketId: "remote",
				user: user("bob"),
				time: 4,
			})
		)

		expect(await socketIds("v5")).toEqual(["local", "remote"])

		await removeViewer("v5", "local")
		await removeViewer("v5", "remote")
	})
})
