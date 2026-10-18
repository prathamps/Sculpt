import { Response } from "express"
import { AppError } from "./errors"
import { logger } from "./logger"

export const respondWithError = (
	res: Response,
	error: unknown,
	action: string
): void => {
	if (error instanceof AppError) {
		res
			.status(error.statusCode)
			.json(error.code ? { code: error.code, message: error.message } : { message: error.message })
		return
	}
	logger.error(`${action} failed`, error)
	res.status(500).json({ message: "Internal server error" })
}
