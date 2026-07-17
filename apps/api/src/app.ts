import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import passport from "./modules/auth/passport"
import authRoutes from "./modules/auth/auth.routes"
import userRoutes from "./modules/auth/users.routes"
import projectRoutes from "./modules/projects/projects.routes"
import shareRoutes from "./modules/projects/share.routes"
import { imageRouter } from "./modules/media/images.routes"
import commentRoutes from "./modules/comments/comments.routes"
import notificationRoutes from "./modules/notifications/notifications.routes"
import exportRoutes from "./modules/export/export.routes"
import adminRoutes from "./modules/admin/admin.routes"
import { isAllowedOrigin } from "./lib/cors"
import { uploadsDir } from "./storage"

const corsOptions: cors.CorsOptions = {
	origin: (origin, callback) => {
		if (isAllowedOrigin(origin)) return callback(null, true)
		callback(new Error("Not allowed by CORS"))
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
}

export const createApp = (): express.Express => {
	const app = express()

	// req.ip / X-Forwarded-For are only trusted when a known proxy count is set,
	// so audit-logged IPs can't be spoofed on a direct-facing deployment.
	if (process.env.TRUST_PROXY) {
		const hops = Number(process.env.TRUST_PROXY)
		app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops)
	}

	app.use(cors(corsOptions))
	app.use(express.json())
	app.use(cookieParser())
	app.use(passport.initialize())

	app.use(
		"/uploads",
		express.static(uploadsDir, {
			setHeaders: (res) => {
				// Stop the browser from sniffing an uploaded file into an executable
				// type, and never render user uploads inline on the API origin.
				res.setHeader("X-Content-Type-Options", "nosniff")
				res.setHeader("Content-Disposition", "inline")
				res.setHeader("Content-Security-Policy", "default-src 'none'")
			},
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
	app.use("/api/comments", commentRoutes)
	app.use("/api/admin", adminRoutes)
	app.use("/api/export", exportRoutes)

	return app
}
