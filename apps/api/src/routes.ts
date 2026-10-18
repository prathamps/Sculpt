import { Router } from "express"

interface HandlerLayer {
	handle: unknown
}

interface RouteLayer {
	handle?: unknown
	route?: {
		path: string | string[]
		methods: Record<string, boolean>
		stack?: HandlerLayer[]
	}
}

export interface RegisteredRoute {
	method: string
	path: string
	handlers: unknown[]
	routerMiddleware: unknown[]
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
	const routerMiddleware = stack
		.filter((layer) => !layer.route)
		.map((layer) => layer.handle)

	for (const layer of stack) {
		if (!layer.route) continue
		const handlers = (layer.route.stack ?? []).map((handler) => handler.handle)
		const paths = Array.isArray(layer.route.path)
			? layer.route.path
			: [layer.route.path]
		for (const routePath of paths) {
			for (const [method, enabled] of Object.entries(layer.route.methods)) {
				if (!enabled || method === "_all") continue
				found.push({
					method: method.toUpperCase(),
					path: joinPaths(prefix, routePath),
					handlers,
					routerMiddleware,
				})
			}
		}
	}

	return found
}

const isRouter = (handle: unknown): handle is Router =>
	typeof handle === "function" && Array.isArray((handle as { stack?: unknown }).stack)

const layersOf = (router: unknown): RouteLayer[] =>
	(router as { stack?: RouteLayer[] }).stack ?? []

export const routersReachableFrom = (root: unknown): Set<Router> => {
	const found = new Set<Router>()
	const visit = (router: unknown): void => {
		for (const layer of layersOf(router)) {
			if (layer.route || !isRouter(layer.handle) || found.has(layer.handle)) continue
			found.add(layer.handle)
			visit(layer.handle)
		}
	}
	visit(root)
	return found
}

export const topLevelRoutePaths = (root: unknown): string[] =>
	layersOf(root).flatMap((layer) =>
		layer.route ? [layer.route.path].flat() : []
	)

export const mountedRoutes = (
	mounts: { router: Router; prefix: string }[]
): RegisteredRoute[] =>
	mounts.flatMap(({ router, prefix }) => routesOf(router, prefix))
