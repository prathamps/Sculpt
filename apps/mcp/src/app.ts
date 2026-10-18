import express, { NextFunction, Request, RequestHandler, Response } from "express"
import { randomUUID } from "crypto"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { McpConfig, originIsAllowed } from "./config.js"
import { logger } from "./logger.js"
import { Caller, CallerResolver, bearerTokenFrom } from "./auth/caller.js"
import { AuthorizationServerError } from "./auth/delegation.js"
import {
	bearerChallenge,
	protectedResourceMetadata,
	protectedResourceMetadataPath,
} from "./auth/protected-resource.js"
import { createSculptServer } from "./server/create-server.js"

const BASE64_OVERHEAD = 1.4
const JSON_ENVELOPE_BYTES = 1024 * 1024
const METADATA_CACHE_MS = 5 * 60000
const METADATA_MAX_AGE_SECONDS = 300

const CALLER_KEY = "caller"
const REQUEST_ID_KEY = "requestId"

const allowAnyOrigin: RequestHandler = (req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID"
	)
	res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate")
	res.setHeader("Access-Control-Max-Age", "600")
	if (req.method === "OPTIONS") {
		res.status(204).end()
		return
	}
	next()
}

const securityHeaders: RequestHandler = (_req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff")
	res.setHeader("Referrer-Policy", "no-referrer")
	res.setHeader("Cache-Control", "no-store")
	next()
}

const assignRequestId: RequestHandler = (_req, res, next) => {
	const requestId = randomUUID()
	res.locals[REQUEST_ID_KEY] = requestId
	res.setHeader("X-Request-Id", requestId)
	next()
}

const jsonRpcError = (res: Response, status: number, message: string): void => {
	res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null })
}

const rejectForeignOrigins =
	(config: McpConfig): RequestHandler =>
	(req, res, next) => {
		const origin = req.headers.origin
		if (!origin || originIsAllowed(config, origin)) {
			next()
			return
		}
		logger.warn("Refused a request from an untrusted web origin", { origin })
		jsonRpcError(
			res,
			403,
			"This web origin may not call Sculpt's MCP server. Ask the administrator to add it to MCP_ALLOWED_ORIGINS."
		)
	}

const authenticate =
	(config: McpConfig, resolver: CallerResolver): RequestHandler =>
	async (req: Request, res: Response, next: NextFunction) => {
		const token = bearerTokenFrom(req.headers.authorization)
		if (!token) {
			res.setHeader("WWW-Authenticate", bearerChallenge(config))
			jsonRpcError(res, 401, "Sign in to Sculpt to continue.")
			return
		}
		try {
			const caller = await resolver.resolve(token)
			if (!caller) {
				res.setHeader(
					"WWW-Authenticate",
					bearerChallenge(config, {
						error: "invalid_token",
						description: "The access token is invalid, expired or not meant for this server.",
					})
				)
				jsonRpcError(res, 401, "The access token is invalid or expired.")
				return
			}
			res.locals[CALLER_KEY] = caller
			next()
		} catch (error) {
			if (error instanceof AuthorizationServerError) {
				logger.warn("Could not verify a caller", { detail: error.message })
				jsonRpcError(res, 503, error.message)
				return
			}
			next(error)
		}
	}

const handleMcpRequest =
	(config: McpConfig): RequestHandler =>
	async (req, res) => {
		const caller = res.locals[CALLER_KEY] as Caller
		const { server, tools } = createSculptServer(config, caller, res.locals[REQUEST_ID_KEY])
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		})
		res.on("close", () => {
			void transport.close()
			void server.close()
		})
		try {
			await server.connect(transport)
			await transport.handleRequest(req, res, req.body)
			logger.debug("MCP request handled", {
				method: typeof req.body?.method === "string" ? req.body.method : "batch",
				via: caller.via,
				clientId: caller.clientId,
				tools: tools.length,
			})
		} catch (error) {
			logger.error("MCP request failed", error)
			if (!res.headersSent) jsonRpcError(res, 500, "Internal server error")
		}
	}

const methodNotAllowed: RequestHandler = (_req, res) => {
	res.setHeader("Allow", "POST, OPTIONS")
	jsonRpcError(res, 405, "This server is stateless: send every message with POST.")
}

const cachedAuthorizationServerMetadata = (config: McpConfig) => {
	let cached: { body: unknown; fetchedAt: number } | null = null
	return async (): Promise<unknown> => {
		if (cached && Date.now() - cached.fetchedAt < METADATA_CACHE_MS) return cached.body
		const response = await fetch(`${config.apiUrl}/.well-known/oauth-authorization-server`)
		if (!response.ok) throw new Error(`Authorization server metadata returned ${response.status}`)
		cached = { body: await response.json(), fetchedAt: Date.now() }
		return cached.body
	}
}

export interface AppDependencies {
	config: McpConfig
	resolver: CallerResolver
}

export const createMcpApp = ({ config, resolver }: AppDependencies): express.Express => {
	const app = express()
	app.disable("x-powered-by")
	if (process.env.TRUST_PROXY) {
		const hops = Number(process.env.TRUST_PROXY)
		app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops)
	}

	const mcpPath = new URL(config.resource).pathname || "/mcp"
	const metadata = protectedResourceMetadata(config)
	const authorizationServerMetadata = cachedAuthorizationServerMetadata(config)
	const bodyLimit = Math.ceil(config.maxUploadBytes * BASE64_OVERHEAD + JSON_ENVELOPE_BYTES)

	app.use(allowAnyOrigin)
	app.use(securityHeaders)
	app.use(assignRequestId)

	app.get("/health", (_req, res) => {
		res.json({ status: "ok", resource: config.resource })
	})

	const serveResourceMetadata: RequestHandler = (_req, res) => {
		res.setHeader("Cache-Control", `public, max-age=${METADATA_MAX_AGE_SECONDS}`)
		res.json(metadata)
	}
	app.get(protectedResourceMetadataPath(config.resource), serveResourceMetadata)
	app.get("/.well-known/oauth-protected-resource", serveResourceMetadata)

	app.get("/.well-known/oauth-authorization-server", async (_req, res) => {
		try {
			res.setHeader("Cache-Control", `public, max-age=${METADATA_MAX_AGE_SECONDS}`)
			res.json(await authorizationServerMetadata())
		} catch (error) {
			logger.warn("Could not relay authorization server metadata", {
				detail: error instanceof Error ? error.message : undefined,
			})
			res.status(502).json({ error: "temporarily_unavailable" })
		}
	})

	app.post(
		mcpPath,
		rejectForeignOrigins(config),
		authenticate(config, resolver),
		express.json({ limit: bodyLimit }),
		handleMcpRequest(config)
	)
	app.get(mcpPath, methodNotAllowed)
	app.delete(mcpPath, methodNotAllowed)

	app.use((error: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
		if (error.type === "entity.too.large") {
			jsonRpcError(res, 413, "The request is too large. Send smaller files.")
			return
		}
		if (error.type === "entity.parse.failed") {
			res.status(400).json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null })
			return
		}
		logger.error("Unhandled request error", error)
		if (!res.headersSent) jsonRpcError(res, 500, "Internal server error")
	})

	return app
}
