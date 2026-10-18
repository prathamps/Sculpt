import { Response } from "express"
import { logger } from "../../lib/logger"

export type OAuthErrorCode =
	| "invalid_request"
	| "invalid_client"
	| "invalid_grant"
	| "unauthorized_client"
	| "unsupported_grant_type"
	| "unsupported_response_type"
	| "unsupported_token_type"
	| "invalid_scope"
	| "invalid_target"
	| "access_denied"
	| "invalid_redirect_uri"
	| "invalid_client_metadata"
	| "temporarily_unavailable"
	| "server_error"

export class OAuthError extends Error {
	constructor(
		readonly error: OAuthErrorCode,
		readonly description: string,
		readonly statusCode = 400
	) {
		super(description)
		this.name = "OAuthError"
	}
}

export const invalidClient = (description = "Client authentication failed."): OAuthError =>
	new OAuthError("invalid_client", description, 401)

export const preventCaching = (res: Response): void => {
	res.setHeader("Cache-Control", "no-store")
	res.setHeader("Pragma", "no-cache")
}

export const respondWithOAuthError = (res: Response, error: unknown, action: string): void => {
	preventCaching(res)
	if (error instanceof OAuthError) {
		if (error.error === "invalid_client" && error.statusCode === 401) {
			res.setHeader("WWW-Authenticate", 'Basic realm="sculpt"')
		}
		res.status(error.statusCode).json({
			error: error.error,
			error_description: error.description,
		})
		return
	}
	logger.error(`OAuth ${action} failed`, error)
	res.status(500).json({
		error: "server_error",
		error_description: "The authorization server hit an unexpected error.",
	})
}
