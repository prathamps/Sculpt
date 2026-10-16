import { AsyncLocalStorage } from "async_hooks"
import { randomUUID } from "crypto"
import { RequestHandler } from "express"

export interface RequestContext {
	requestId: string
	ipAddress: string | null
	userAgent: string | null
}

const MAX_USER_AGENT_LENGTH = 512
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/

const contexts = new AsyncLocalStorage<RequestContext>()

export const currentRequestContext = (): RequestContext | null =>
	contexts.getStore() ?? null

export const requestIdFrom = (header: unknown): string =>
	typeof header === "string" && ACCEPTED_REQUEST_ID.test(header)
		? header
		: randomUUID()

export const userAgentFrom = (header: unknown): string | null =>
	typeof header === "string" && header
		? header.slice(0, MAX_USER_AGENT_LENGTH)
		: null

export const runWithRequestContext = <T>(context: RequestContext, run: () => T): T =>
	contexts.run(context, run)

export const bindRequestContext: RequestHandler = (req, res, next) => {
	const requestId = requestIdFrom(req.headers["x-request-id"])
	res.setHeader("X-Request-Id", requestId)
	runWithRequestContext(
		{
			requestId,
			ipAddress: req.ip ?? null,
			userAgent: userAgentFrom(req.headers["user-agent"]),
		},
		next
	)
}
