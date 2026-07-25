import dotenv from "dotenv"

dotenv.config()

import http from "http"
import { createApp } from "./app"
import { attachRealtime } from "./realtime/socket"
import { failAbandonedProxyJobs } from "./modules/media/video-pipeline"
import "./lib/redis"

const server = http.createServer(createApp())
attachRealtime(server)
failAbandonedProxyJobs().catch((error) =>
	console.error("Proxy job recovery failed:", error)
)

const port = process.env.PORT || 3001

server.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})
