import { describe, expect, it, vi } from "vitest"
import { SculptApi, SculptApiError, readAtMost } from "./api-client.js"

const streamOf = (chunks: number[]) =>
	new Response(
		new ReadableStream({
			start(controller) {
				chunks.forEach((size) => controller.enqueue(new Uint8Array(size)))
				controller.close()
			},
		})
	)

describe("readAtMost", () => {
	it("reads a body that fits", async () => {
		expect((await readAtMost(streamOf([3, 4]), 10)).length).toBe(7)
	})

	it("stops reading as soon as a body without a declared length grows too large", async () => {
		await expect(readAtMost(streamOf([6, 6, 6]), 10)).rejects.toBeInstanceOf(SculptApiError)
	})
})

describe("SculptApi", () => {
	it("tells the caller when Sculpt stops accepting its token", async () => {
		const onUnauthorized = vi.fn()
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
		const api = new SculptApi("http://sculpt.test", async () => "token", undefined, onUnauthorized)

		await expect(api.get("/api/projects")).rejects.toMatchObject({ status: 401 })
		expect(onUnauthorized).toHaveBeenCalled()
		fetchMock.mockRestore()
	})
})
