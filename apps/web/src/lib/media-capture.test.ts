import { describe, expect, it } from "vitest"
import { withMimeTypeTheApiCanMap } from "./media-capture"

const fileNamed = (name: string, type: string) =>
	new File([new Uint8Array([1, 2, 3])], name, { type })

describe("withMimeTypeTheApiCanMap", () => {
	it("labels a .glb the browser reported with no type", () => {
		expect(withMimeTypeTheApiCanMap(fileNamed("cube.glb", "")).type).toBe(
			"model/gltf-binary"
		)
	})

	it("labels a .glb the browser reported as a generic binary", () => {
		const file = fileNamed("cube.GLB", "application/octet-stream")
		expect(withMimeTypeTheApiCanMap(file).type).toBe("model/gltf-binary")
	})

	it("keeps the file name and bytes when relabelling", async () => {
		const original = fileNamed("my model.glb", "")
		const relabelled = withMimeTypeTheApiCanMap(original)

		expect(relabelled.name).toBe("my model.glb")
		expect(new Uint8Array(await relabelled.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3])
		)
	})

	it("passes through a .glb already labelled correctly", () => {
		const file = fileNamed("cube.glb", "model/gltf-binary")
		expect(withMimeTypeTheApiCanMap(file)).toBe(file)
	})

	it("never rewrites the type of other media", () => {
		for (const [name, type] of [
			["shot.png", "image/png"],
			["clip.mp4", "video/mp4"],
			["spec.pdf", "application/pdf"],
		] as const) {
			const file = fileNamed(name, type)
			expect(withMimeTypeTheApiCanMap(file)).toBe(file)
		}
	})
})
