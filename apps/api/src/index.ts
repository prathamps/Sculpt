import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import passport from "./lib/passport"
import cookieParser from "cookie-parser"
import authRoutes from "./routes/auth.routes"
import userRoutes from "./routes/users.routes"
import projectRoutes from "./routes/projects.routes"
import { imageRouter } from "./routes/images.routes"
import shareRoutes from "./routes/share.routes"
import path from "path"

dotenv.config()

const app = express()

const corsOptions = {
	origin: "http://localhost:3000",
	credentials: true,
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(passport.initialize())

// Statically serve the 'uploads' directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/projects", projectRoutes)
app.use("/api/images", imageRouter)
app.use("/api/share", shareRoutes)

const port = process.env.PORT || 3001

app.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})
