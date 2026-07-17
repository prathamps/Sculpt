import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import path from "path"
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

const corsOptions: cors.CorsOptions = {
	origin: (origin, callback) => {
		if (!origin) return callback(null, true)
		if (
			origin.includes("localhost") ||
			origin.includes("127.0.0.1") ||
			origin.includes("vercel.app") ||
			origin === process.env.FRONTEND_URL
		) {
			return callback(null, true)
		}
		callback(new Error("Not allowed by CORS"))
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
}

export const createApp = (): express.Express => {
	const app = express()

	app.use(cors(corsOptions))
	app.use(express.json())
	app.use(cookieParser())
	app.use(passport.initialize())

	app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

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
