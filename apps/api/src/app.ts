import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import passport from "./modules/auth/passport"
import authRoutes from "./modules/auth/auth.routes"
import userRoutes from "./modules/auth/users.routes"
import projectRoutes from "./modules/projects/projects.routes"
import shareRoutes from "./modules/projects/share.routes"
import { imageRouter } from "./modules/media/images.routes"
import notificationRoutes from "./modules/notifications/notifications.routes"
import exportRoutes from "./modules/export/export.routes"
import adminRoutes from "./modules/admin/admin.routes"
import { isAllowedOrigin } from "./lib/cors"
import { oversizedUploadMessage } from "./middleware/upload.middleware"
import { uploadsDir } from "./storage"

const pdfJsRangedFetchHeader = "Range"

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

const setNonExecutableUploadHeaders = (res: express.Response): void => {
	res.setHeader("X-Content-Type-Options", "nosniff")
	res.setHeader("Content-Disposition", "inline")
	res.setHeader("Content-Security-Policy", "default-src 'none'")
}

const isUploadRejection = (err: Error & { code?: string }): boolean =>
	err?.code === "LIMIT_FILE_SIZE" ||
	err?.code === "LIMIT_UNEXPECTED_FILE" ||
	!!err?.message?.startsWith("Unsupported file type")

export const createApp = (): express.Express => {
	const app = express()

	trustProxyOnlyWithKnownHopCount(app)

	app.use(cors(corsOptions))
	app.use(express.json())
	app.use(cookieParser())
	app.use(passport.initialize())

	app.use(
		"/uploads",
		express.static(uploadsDir, {
			setHeaders: setNonExecutableUploadHeaders,
		})
	)

	app.get("/health", (_req, res) => {
		res.json({ status: "ok" })
	})

	app.use("/api/auth", authRoutes)
	app.use("/api/users", userRoutes)
	app.use("/api/projects", projectRoutes)
	app.use("/api/images", imageRouter)
	app.use("/api/share", shareRoutes)
	app.use("/api/notifications", notificationRoutes)
	app.use("/api/admin", adminRoutes)
	app.use("/api/export", exportRoutes)

	app.use(
		(
			err: Error & { code?: string },
			_req: express.Request,
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
			console.error(err)
			res.status(500).json({ message: "Internal server error" })
		}
	)

	return app
}
