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

const DEFAULT_SHUTDOWN_GRACE_MS = 30000

const shutdownGraceMs = (): number => {
	const configured = Number(process.env.SHUTDOWN_GRACE_MS)
	return Number.isFinite(configured) && configured > 0
		? configured
		: DEFAULT_SHUTDOWN_GRACE_MS
}

const shutdownGracefully = (server: http.Server, signal: string): void => {
	logger.info("Received shutdown signal, draining connections", { signal })
	server.close(() => {
		logger.info("Server drained, exiting")
		process.exit(0)
	})
	setTimeout(() => {
		logger.warn("Shutdown grace period elapsed, exiting with work in flight")
		process.exit(1)
	}, shutdownGraceMs()).unref()
}

const start = async (): Promise<void> => {
	const server = http.createServer(createApp())

	await attachRealtime(server)

	failAbandonedProxyJobs().catch((error) =>
		logger.error("Proxy job recovery failed", error)
	)
	startSessionMaintenance()
	startStagingReaper()

	process.on("SIGTERM", () => shutdownGracefully(server, "SIGTERM"))
	process.on("SIGINT", () => shutdownGracefully(server, "SIGINT"))

	server.listen(port, () => {
		logger.info("Server listening", { port })
	})
}

void start().catch((error) => {
	logger.error("Server failed to start", error)
	process.exit(1)
})
