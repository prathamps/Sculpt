import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { mountedRoutes } from "./routes"
import { APP_LEVEL_ROUTES, ROUTER_MOUNTS as MOUNTS } from "./route-mounts"

const asOpenApiPath = (expressPath: string): string =>
	expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}")

const SPEC_PATH = path.join(__dirname, "../../../docs/openapi.yaml")

const readSpec = (): string | null => {
	try {
		return fs.readFileSync(SPEC_PATH, "utf-8")
	} catch {
		return null
	}
}

const documentedPaths = (spec: string): Set<string> => {
	const paths = new Set<string>()
	for (const line of spec.split(/\r?\n/)) {
		const match = /^ {2}(\/\S*):\s*$/.exec(line)
		if (match) paths.add(match[1])
	}
	return paths
}

describe("openapi coverage", () => {
	const spec = readSpec()
	const documented = documentedPaths(spec ?? "")

	it("finds the spec next to the API package", () => {
		expect(
			spec === null ? `unreadable at ${SPEC_PATH}` : documented.size
		).toBeGreaterThan(40)
	})

	it("documents every mounted API route", () => {
		const live = new Set(
			[
				...mountedRoutes(MOUNTS).map((route) => route.path),
				...APP_LEVEL_ROUTES,
			].map(asOpenApiPath)
		)

		const undocumented = Array.from(live)
			.filter((routePath) => !documented.has(routePath))
			.sort()

		expect(undocumented).toEqual([])
	})

	it("does not document routes that no longer exist", () => {
		const live = new Set(
			[
				...mountedRoutes(MOUNTS).map((route) => route.path),
				...APP_LEVEL_ROUTES,
			].map(asOpenApiPath)
		)

		const stale = Array.from(documented)
			.filter((routePath) => !live.has(routePath))
			.sort()

		expect(stale).toEqual([])
	})
})
