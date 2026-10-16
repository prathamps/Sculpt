import { Router } from "express"

interface RouteLayer {
	route?: {
		path: string | string[]
		methods: Record<string, boolean>
	}
}

export interface RegisteredRoute {
	method: string
	path: string
}

const joinPaths = (prefix: string, path: string): string => {
	const combined = `${prefix}${path}`.replace(/\/{2,}/g, "/")
	if (combined.length > 1 && combined.endsWith("/")) {
		return combined.slice(0, -1)
	}
	return combined || "/"
}

export const routesOf = (
	router: Router,
	prefix: string
): RegisteredRoute[] => {
	const stack = (router as unknown as { stack?: RouteLayer[] }).stack ?? []
	const found: RegisteredRoute[] = []

	for (const layer of stack) {
		if (!layer.route) continue
		const paths = Array.isArray(layer.route.path)
			? layer.route.path
			: [layer.route.path]
		for (const routePath of paths) {
			for (const [method, enabled] of Object.entries(layer.route.methods)) {
				if (!enabled || method === "_all") continue
				found.push({
					method: method.toUpperCase(),
					path: joinPaths(prefix, routePath),
				})
			}
		}
	}

	return found
}

export const mountedRoutes = (
	mounts: { router: Router; prefix: string }[]
): RegisteredRoute[] =>
	mounts.flatMap(({ router, prefix }) => routesOf(router, prefix))
