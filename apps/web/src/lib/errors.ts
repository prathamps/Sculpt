import { ApiError } from "./api"

export const describeError = (error: unknown, fallback: string): string => {
	if (error instanceof ApiError) return error.message
	if (error instanceof Error && error.message) return error.message
	return fallback
}

export const ignoreFailure = (): undefined => undefined
