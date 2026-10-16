import { RequestHandler } from "express"
import { Histogram, Registry, collectDefaultMetrics } from "prom-client"

export const metricsRegistry = new Registry()

collectDefaultMetrics({ register: metricsRegistry, prefix: "sculpt_" })

const httpRequestDuration = new Histogram({
	name: "sculpt_http_request_duration_seconds",
	help: "HTTP request latency by route template and status class",
	labelNames: ["method", "route", "status"] as const,
	buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [metricsRegistry],
})

const UNMATCHED_ROUTE = "unmatched"

export const routeTemplateOf = (
	baseUrl: string,
	routePath: unknown
): string =>
	typeof routePath === "string" ? `${baseUrl}${routePath}` || "/" : UNMATCHED_ROUTE

export const statusClassOf = (statusCode: number): string =>
	`${Math.floor(statusCode / 100)}xx`

export const recordRequestMetrics: RequestHandler = (req, res, next) => {
	const stopTimer = httpRequestDuration.startTimer()
	res.on("finish", () => {
		stopTimer({
			method: req.method,
			route: routeTemplateOf(req.baseUrl, req.route?.path),
			status: statusClassOf(res.statusCode),
		})
	})
	next()
}
