import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { Router } from "express"
import authRoutes from "./modules/auth/auth.routes"
import userRoutes from "./modules/auth/users.routes"
import projectRoutes from "./modules/projects/projects.routes"
import shareRoutes from "./modules/projects/share.routes"
import invitationRoutes from "./modules/projects/invitations.routes"
import { imageRouter, projectImagesRouter } from "./modules/media/images.routes"
import commentsRouter from "./modules/comments/comments.routes"
import {
	projectFoldersRouter,
	projectImageFolderRouter,
} from "./modules/folders/folders.routes"
import {
	projectReviewRouter,
	versionReviewRouter,
} from "./modules/reviews/reviews.routes"
import notificationRoutes from "./modules/notifications/notifications.routes"
import exportRoutes from "./modules/export/export.routes"
import adminRoutes from "./modules/admin/admin.routes"
import searchRoutes from "./modules/search/search.routes"
import { mountedRoutes } from "./routes"

const MOUNTS: { router: Router; prefix: string }[] = [
	{ router: authRoutes, prefix: "/api/auth" },
	{ router: userRoutes, prefix: "/api/users" },
	{ router: projectRoutes, prefix: "/api/projects" },
	{ router: shareRoutes, prefix: "/api/share" },
	{ router: invitationRoutes, prefix: "/api/invitations" },
	{ router: imageRouter, prefix: "/api/images" },
	{ router: commentsRouter, prefix: "/api/images" },
	{ router: versionReviewRouter, prefix: "/api/images" },
	{ router: projectImagesRouter, prefix: "/api/projects/:projectId/images" },
	{
		router: projectImageFolderRouter,
		prefix: "/api/projects/:projectId/images",
	},
	{ router: projectFoldersRouter, prefix: "/api/projects/:projectId/folders" },
	{ router: projectReviewRouter, prefix: "/api/projects/:projectId/reviews" },
	{ router: notificationRoutes, prefix: "/api/notifications" },
	{ router: exportRoutes, prefix: "/api/export" },
	{ router: adminRoutes, prefix: "/api/admin" },
	{ router: searchRoutes, prefix: "/api/search" },
]

const APP_LEVEL_ROUTES = ["/health", "/uploads/:filename"]

const asOpenApiPath = (expressPath: string): string =>
	expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}")

const documentedPaths = (): Set<string> => {
	const spec = fs.readFileSync(
		path.join(__dirname, "../../../docs/openapi.yaml"),
		"utf-8"
	)
	const paths = new Set<string>()
	for (const line of spec.split(/\r?\n/)) {
		const match = /^ {2}(\/\S*):\s*$/.exec(line)
		if (match) paths.add(match[1])
	}
	return paths
}

describe("openapi coverage", () => {
	const documented = documentedPaths()

	it("finds the spec", () => {
		expect(documented.size).toBeGreaterThan(40)
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
