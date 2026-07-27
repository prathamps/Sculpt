import { isProduction } from "./config"

type Level = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<Level, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
}

export type LogContext = Record<string, unknown>

const configuredLevel = (): Level => {
	const configured = process.env.LOG_LEVEL?.toLowerCase()
	if (configured && configured in LEVEL_RANK) return configured as Level
	return isProduction() ? "info" : "debug"
}

const describeError = (error: unknown): LogContext => {
	if (error instanceof Error) {
		return {
			errorName: error.name,
			errorMessage: error.message,
			...(isProduction() ? {} : { stack: error.stack }),
		}
	}
	if (error === undefined) return {}
	return { errorMessage: String(error) }
}

const write = (level: Level, message: string, context: LogContext): void => {
	if (LEVEL_RANK[level] < LEVEL_RANK[configuredLevel()]) return

	const entry = {
		level,
		message,
		time: new Date().toISOString(),
		...context,
	}

	const sink = level === "error" || level === "warn" ? console.error : console.log
	sink(isProduction() ? JSON.stringify(entry) : formatForHumans(entry))
}

const formatForHumans = (entry: LogContext & { level: Level; message: string }) => {
	const { level, message, time, ...rest } = entry
	const detail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""
	return `[${level}] ${message}${detail}`
}

export const logger = {
	debug: (message: string, context: LogContext = {}) =>
		write("debug", message, context),
	info: (message: string, context: LogContext = {}) =>
		write("info", message, context),
	warn: (message: string, context: LogContext = {}) =>
		write("warn", message, context),
	error: (message: string, error?: unknown, context: LogContext = {}) =>
		write("error", message, { ...describeError(error), ...context }),
}
