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
import resumableUploadRoutes from "./modules/media/resumable-upload.routes"
import adminRoutes from "./modules/admin/admin.routes"
import searchRoutes from "./modules/search/search.routes"
import { consentRouter, oauthPublicRouter } from "./modules/oauth/oauth.routes"

export interface RouterMount {
	router: Router
	prefix: string
}

export const ROUTER_MOUNTS: RouterMount[] = [
	{ router: oauthPublicRouter, prefix: "" },
	{ router: consentRouter, prefix: "/api/oauth" },
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
	{ router: resumableUploadRoutes, prefix: "/api/uploads" },
	{ router: adminRoutes, prefix: "/api/admin" },
	{ router: searchRoutes, prefix: "/api/search" },
]

export const APP_LEVEL_ROUTES = ["/health", "/metrics", "/uploads/:filename"]
