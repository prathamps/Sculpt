import { RequestHandler } from "express"
import { ZodType } from "zod"

const firstIssueMessage = (issues: { path: (string | number | symbol)[]; message: string }[]) => {
	const issue = issues[0]
	if (!issue) return "Invalid request body."
	const field = issue.path.filter((segment) => segment !== undefined).join(".")
	return field ? `${field}: ${issue.message}` : issue.message
}

export const validateBody =
	<T>(schema: ZodType<T>): RequestHandler =>
	(req, res, next) => {
		const result = schema.safeParse(req.body ?? {})
		if (!result.success) {
			res.status(400).json({ message: firstIssueMessage(result.error.issues) })
			return
		}
		req.body = result.data
		next()
	}

export const validateQuery =
	<T>(schema: ZodType<T>): RequestHandler =>
	(req, res, next) => {
		const result = schema.safeParse(req.query ?? {})
		if (!result.success) {
			res.status(400).json({ message: firstIssueMessage(result.error.issues) })
			return
		}
		res.locals.query = result.data
		next()
	}
