import dotenv from "dotenv"

dotenv.config()

import http from "http"
import { createApp } from "./app"
import { assertStartupConfiguration } from "./lib/config"
import { logger } from "./lib/logger"
import { attachRealtime } from "./realtime/socket"
import { failAbandonedProxyJobs } from "./modules/media/video-pipeline"
import { startSessionMaintenance } from "./modules/auth/session.maintenance"
import { startStagingReaper } from "./middleware/upload.middleware"
import "./lib/redis"

try {
	assertStartupConfiguration()
} catch (error) {
	logger.error("Refusing to start with an unsafe configuration", error)
	process.exit(1)
}

const port = Number(process.env.PORT) || 3001

const start = async (): Promise<void> => {
	const server = http.createServer(createApp())

	await attachRealtime(server)

	failAbandonedProxyJobs().catch((error) =>
		logger.error("Proxy job recovery failed", error)
	)
	startSessionMaintenance()
	startStagingReaper()

	server.listen(port, () => {
		logger.info("Server listening", { port })
	})
}

void start().catch((error) => {
	logger.error("Server failed to start", error)
	process.exit(1)
})
