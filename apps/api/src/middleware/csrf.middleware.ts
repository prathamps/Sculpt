import { Request, RequestHandler } from "express"
import { isAllowedOrigin } from "../lib/cors"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

const requestOrigin = (req: Request): string | undefined => {
	const origin = req.headers.origin
	if (typeof origin === "string") return origin
	const referer = req.headers.referer
	if (typeof referer === "string") {
		try {
			return new URL(referer).origin
		} catch {
			return referer
		}
	}
	return undefined
}

export const rejectCrossSiteMutations: RequestHandler = (req, res, next) => {
	if (SAFE_METHODS.has(req.method)) {
		next()
		return
	}
	if (isAllowedOrigin(requestOrigin(req))) {
		next()
		return
	}
	res
		.status(403)
		.json({ message: "Request origin is not allowed to modify data." })
}
