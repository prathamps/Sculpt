import http from "http"
import { ConfigurationError, loadConfig } from "./config.js"
import { logger } from "./logger.js"
import { createMcpApp } from "./app.js"
import { createAccessTokenVerifier } from "./auth/token-verifier.js"
import { createDelegation } from "./auth/delegation.js"
import { createCallerResolver } from "./auth/caller.js"

const SHUTDOWN_GRACE_MS = 10000

const start = (): void => {
	const config = loadConfig()
	const resolver = createCallerResolver(createAccessTokenVerifier(config), createDelegation(config))
	const server = http.createServer(createMcpApp({ config, resolver }))

	const shutdown = (signal: string) => {
		logger.info("Shutting down", { signal })
		setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref()
		server.close(() => process.exit(0))
	}
	process.on("SIGTERM", () => shutdown("SIGTERM"))
	process.on("SIGINT", () => shutdown("SIGINT"))

	server.listen(config.port, () => {
		logger.info("Sculpt MCP server listening", {
			port: config.port,
			resource: config.resource,
			api: config.apiUrl,
			issuer: config.issuer,
		})
	})
}

try {
	start()
} catch (error) {
	logger.error(
		error instanceof ConfigurationError ? "Refusing to start" : "Failed to start",
		error
	)
	process.exit(1)
}
