import { describe, expect, it, vi } from "vitest"
import { createCameraLink } from "./camera-link"

const view = { position: [1, 2, 3] as [number, number, number], target: [0, 0, 0] as [number, number, number] }

describe("createCameraLink", () => {
	it("moves every other linked viewer but never echoes back to the one that moved", () => {
		const link = createCameraLink()
		const left = vi.fn()
		const right = vi.fn()
		link.subscribe("left", left)
		link.subscribe("right", right)

		link.publish("left", view)

		expect(left).not.toHaveBeenCalled()
		expect(right).toHaveBeenCalledWith(view)
	})

	it("stops moving a viewer once it unlinks", () => {
		const link = createCameraLink()
		const right = vi.fn()
		const unsubscribe = link.subscribe("right", right)

		unsubscribe()
		link.publish("left", view)

		expect(right).not.toHaveBeenCalled()
	})
})
