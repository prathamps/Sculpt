import { describe, expect, it } from "vitest"
import {
	mountedRoutes,
	RegisteredRoute,
	routersReachableFrom,
	topLevelRoutePaths,
} from "./routes"
import { APP_LEVEL_ROUTES, ROUTER_MOUNTS } from "./route-mounts"
import { declaredScopeOf, isSessionOnly } from "./middleware/scope.middleware"
import { createApp } from "./app"

const UNREACHABLE_BY_BEARER_TOKENS = [
	/^\/api\/auth\//,
	/^\/api\/admin\//,
	/^\/\.well-known\//,
	/^\/oauth\//,
	/^\/api\/oauth\/integration$/,
]

const isTokenReachable = (route: RegisteredRoute): boolean =>
	!UNREACHABLE_BY_BEARER_TOKENS.some((pattern) => pattern.test(route.path))

const everyHandlerOf = (route: RegisteredRoute): unknown[] => [
	...route.routerMiddleware,
	...route.handlers,
]

const declaredScopesOf = (route: RegisteredRoute): string[] =>
	everyHandlerOf(route)
		.map(declaredScopeOf)
		.filter((scope): scope is NonNullable<typeof scope> => !!scope)

const isSessionOnlyRoute = (route: RegisteredRoute): boolean =>
	everyHandlerOf(route).some(isSessionOnly)

const label = (route: RegisteredRoute): string => `${route.method} ${route.path}`

const routes = mountedRoutes(ROUTER_MOUNTS)

const find = (method: string, path: string): RegisteredRoute => {
	const route = routes.find((candidate) => candidate.method === method && candidate.path === path)
	if (!route) throw new Error(`No route ${method} ${path}`)
	return route
}

const appRouter = (): unknown => (createApp() as unknown as { router: unknown }).router

describe("route inventory", () => {
	it("lists exactly the routers the app mounts, so the coverage checks see every route", () => {
		const mounted = routersReachableFrom(appRouter())
		const listed = new Set(ROUTER_MOUNTS.map((mount) => mount.router))
		const unlisted = [...mounted].filter((router) => !listed.has(router))
		const unmounted = [...listed].filter((router) => !mounted.has(router))

		expect(unlisted).toHaveLength(0)
		expect(unmounted).toHaveLength(0)
	})

	it("lists exactly the routes the app registers outside any router", () => {
		expect([...topLevelRoutePaths(appRouter())].sort()).toEqual([...APP_LEVEL_ROUTES].sort())
	})
})

describe("delegated access coverage", () => {
	it("every route a bearer token can reach declares the scope it needs or is session-only", () => {
		const undeclared = routes
			.filter(isTokenReachable)
			.filter((route) => declaredScopesOf(route).length === 0 && !isSessionOnlyRoute(route))
			.map(label)

		expect(undeclared).toEqual([])
	})

	it("account security, token management and consent stay session-only", () => {
		const sessionOnlyRoutes = [
			["POST", "/api/users/me/password"],
			["GET", "/api/users/me/export"],
			["GET", "/api/users/me/mfa"],
			["POST", "/api/users/me/mfa/setup"],
			["POST", "/api/users/me/mfa/enable"],
			["POST", "/api/users/me/mfa/disable"],
			["POST", "/api/users/me/mfa/recovery-codes"],
			["DELETE", "/api/users/me"],
			["GET", "/api/users/me/connections"],
			["DELETE", "/api/users/me/connections/:grantId"],
			["GET", "/api/users/me/tokens"],
			["POST", "/api/users/me/tokens"],
			["DELETE", "/api/users/me/tokens/:tokenId"],
			["POST", "/api/oauth/consent"],
			["POST", "/api/oauth/consent/details"],
		]
		const notSessionOnly = sessionOnlyRoutes
			.map(([method, path]) => find(method, path))
			.filter((route) => !isSessionOnlyRoute(route))
			.map(label)

		expect(notSessionOnly).toEqual([])
	})

	it("derives the scope from the route's minimum project role", () => {
		expect(declaredScopesOf(find("GET", "/api/projects/:id"))).toContain("sculpt:read")
		expect(
			declaredScopesOf(find("POST", "/api/images/versions/:imageVersionId/comments"))
		).toContain("sculpt:feedback")
		expect(declaredScopesOf(find("POST", "/api/projects/:projectId/images"))).toContain(
			"sculpt:content"
		)
		expect(declaredScopesOf(find("DELETE", "/api/projects/:id"))).toContain("sculpt:manage")
	})

	it("treats changing your own membership as project administration", () => {
		expect(declaredScopesOf(find("POST", "/api/projects/:projectId/members/leave"))).toContain(
			"sculpt:manage"
		)
		expect(declaredScopesOf(find("POST", "/api/share/:token"))).toContain("sculpt:manage")
		expect(declaredScopesOf(find("POST", "/api/invitations/:token/accept"))).toContain(
			"sculpt:manage"
		)
	})

	it("requires read access to stream stored media with a token", () => {
		const app = createApp() as unknown as {
			router: { stack: { route?: { path: string; stack: { handle: unknown }[] } }[] }
		}
		const uploads = app.router.stack.find((layer) => layer.route?.path === "/uploads/:filename")
		const scopes = (uploads?.route?.stack ?? []).map((layer) => declaredScopeOf(layer.handle))

		expect(scopes).toContain("sculpt:read")
	})
})
