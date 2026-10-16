import dotenv from "dotenv"

dotenv.config()

import http from "http"
import { createApp } from "./app"
import { assertStartupConfiguration, startupWarnings } from "./lib/config"
import { logger } from "./lib/logger"
import { attachRealtime, io } from "./realtime/socket"
import { startRenditionMaintenance } from "./modules/media/rendition-recovery"
import { startSessionMaintenance } from "./modules/auth/session.maintenance"
import { startStagingReaper } from "./middleware/upload.middleware"
import { notificationQueueDrained } from "./modules/notifications/notification.service"
import { startNotificationRetention } from "./modules/notifications/notification.maintenance"
import { startAuditRetention } from "./modules/audit/audit.maintenance"
import { startInvitationMaintenance } from "./modules/projects/invitation.maintenance"
import "./lib/redis"

try {
	assertStartupConfiguration()
} catch (error) {
	logger.error("Refusing to start with an unsafe configuration", error)
	process.exit(1)
}

startupWarnings().forEach((warning) => logger.warn(warning))

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
	setTimeout(() => {
		logger.warn("Shutdown grace period elapsed, exiting with work in flight")
		process.exit(1)
	}, shutdownGraceMs()).unref()
	io.disconnectSockets(true)
	server.close(() => {
		void notificationQueueDrained().finally(() => {
			logger.info("Server drained, exiting")
			process.exit(0)
		})
	})
}

const start = async (): Promise<void> => {
	const server = http.createServer(createApp())

	await attachRealtime(server)

	await startRenditionMaintenance()
	startSessionMaintenance()
	startNotificationRetention()
	startAuditRetention()
	startInvitationMaintenance()
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
