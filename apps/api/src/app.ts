import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import passport from "./modules/auth/passport"
import authRoutes from "./modules/auth/auth.routes"
import userRoutes from "./modules/auth/users.routes"
import projectRoutes from "./modules/projects/projects.routes"
import shareRoutes from "./modules/projects/share.routes"
import invitationRoutes from "./modules/projects/invitations.routes"
import { imageRouter } from "./modules/media/images.routes"
import notificationRoutes from "./modules/notifications/notifications.routes"
import exportRoutes from "./modules/export/export.routes"
import adminRoutes from "./modules/admin/admin.routes"
import searchRoutes from "./modules/search/search.routes"
import { serveMediaFile } from "./modules/media/media-files.controller"
import { healthCheck } from "./modules/health/health.controller"
import { isAllowedOrigin } from "./lib/cors"
import { logger } from "./lib/logger"
import { authenticateJWT } from "./middleware/auth.middleware"
import { oversizedUploadMessage } from "./middleware/upload.middleware"

const pdfJsRangedFetchHeader = "Range"

const JSON_BODY_LIMIT = "1mb"

const corsOptions: cors.CorsOptions = {
	origin: (origin, callback) => {
		if (isAllowedOrigin(origin)) return callback(null, true)
		callback(new Error("Not allowed by CORS"))
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: [
		"Content-Type",
		"Authorization",
		"Cookie",
		pdfJsRangedFetchHeader,
	],
}

const trustProxyOnlyWithKnownHopCount = (app: express.Express): void => {
	if (!process.env.TRUST_PROXY) return
	const hops = Number(process.env.TRUST_PROXY)
	app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops)
}

const applySecurityHeaders: express.RequestHandler = (_req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff")
	res.setHeader("Referrer-Policy", "no-referrer")
	res.setHeader("X-Frame-Options", "DENY")
	res.setHeader("Cross-Origin-Resource-Policy", "same-site")
	next()
}

const isUploadRejection = (err: Error & { code?: string }): boolean =>
	err?.code === "LIMIT_FILE_SIZE" ||
	err?.code === "LIMIT_UNEXPECTED_FILE" ||
	!!err?.message?.startsWith("Unsupported file type")

export const createApp = (): express.Express => {
	const app = express()

	trustProxyOnlyWithKnownHopCount(app)

	app.use(cors(corsOptions))
	app.use(applySecurityHeaders)
	app.use(express.json({ limit: JSON_BODY_LIMIT }))
	app.use(cookieParser())
	app.use(passport.initialize())

	app.get("/uploads/:filename", authenticateJWT, serveMediaFile)

	app.get("/health", healthCheck)

	app.use("/api/auth", authRoutes)
	app.use("/api/users", userRoutes)
	app.use("/api/projects", projectRoutes)
	app.use("/api/images", imageRouter)
	app.use("/api/share", shareRoutes)
	app.use("/api/invitations", invitationRoutes)
	app.use("/api/notifications", notificationRoutes)
	app.use("/api/admin", adminRoutes)
	app.use("/api/export", exportRoutes)
	app.use("/api/search", searchRoutes)

	app.use(
		(
			err: Error & { code?: string },
			req: express.Request,
			res: express.Response,
			next: express.NextFunction
		) => {
			if (res.headersSent) return next(err)
			if (isUploadRejection(err)) {
				res.status(400).json({
					message:
						err.code === "LIMIT_FILE_SIZE"
							? oversizedUploadMessage()
							: err.message,
				})
				return
			}
			logger.error("Unhandled request error", err, {
				method: req.method,
				path: req.path,
			})
			res.status(500).json({ message: "Internal server error" })
		}
	)

	return app
}
