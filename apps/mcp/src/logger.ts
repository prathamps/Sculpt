type Level = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const configuredLevel = (): Level => {
	const configured = process.env.LOG_LEVEL?.toLowerCase()
	if (configured && configured in LEVEL_RANK) return configured as Level
	return process.env.NODE_ENV === "production" ? "info" : "debug"
}

const describeError = (error: unknown): Record<string, unknown> => {
	if (error instanceof Error) return { errorName: error.name, errorMessage: error.message }
	if (error === undefined) return {}
	return { errorMessage: String(error) }
}

const write = (level: Level, message: string, context: Record<string, unknown>): void => {
	if (LEVEL_RANK[level] < LEVEL_RANK[configuredLevel()]) return
	const entry = { level, message, time: new Date().toISOString(), service: "mcp", ...context }
	const line =
		process.env.NODE_ENV === "production"
			? JSON.stringify(entry)
			: `[${level}] ${message}${Object.keys(context).length ? ` ${JSON.stringify(context)}` : ""}`
	process.stderr.write(`${line}\n`)
}

export const logger = {
	debug: (message: string, context: Record<string, unknown> = {}) => write("debug", message, context),
	info: (message: string, context: Record<string, unknown> = {}) => write("info", message, context),
	warn: (message: string, context: Record<string, unknown> = {}) => write("warn", message, context),
	error: (message: string, error?: unknown, context: Record<string, unknown> = {}) =>
		write("error", message, { ...describeError(error), ...context }),
}
