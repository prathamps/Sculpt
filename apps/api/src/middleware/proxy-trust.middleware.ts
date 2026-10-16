import { RequestHandler } from "express"
import { logger } from "../lib/logger"

export const warnWhenForwardedHeadersAreIgnored = (): RequestHandler => {
	let warned = false
	return (req, _res, next) => {
		if (!warned && req.headers["x-forwarded-for"] && !req.app.get("trust proxy")) {
			warned = true
			logger.warn(
				"Requests arrive through a proxy but TRUST_PROXY is not set, so every user shares the proxy's address for rate limits and audit logs. Set TRUST_PROXY to the number of proxies in front of the API."
			)
		}
		next()
	}
}
