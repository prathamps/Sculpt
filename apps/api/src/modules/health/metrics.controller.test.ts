import { describe, expect, it, vi, afterEach } from "vitest"

vi.mock("../../realtime/socket", () => ({ io: { engine: { clientsCount: 7 } } }))
vi.mock("../media/video-pipeline", () => ({ videoQueueDepth: () => 2 }))
vi.mock("../media/image-pipeline", () => ({ imageQueueDepth: () => 1 }))
vi.mock("../notifications/notification.service", () => ({
	notificationQueueDepth: () => 0,
}))

import { Request, Response } from "express"
import { presentsToken, serveMetrics } from "./metrics.controller"
import { routeTemplateOf, statusClassOf } from "../../lib/metrics"

const response = () => {
	const res = {
		statusCode: 200,
		body: undefined as unknown,
		headers: {} as Record<string, string>,
		status(code: number) {
			res.statusCode = code
			return res
		},
		json(body: unknown) {
			res.body = body
			return res
		},
		send(body: unknown) {
			res.body = body
			return res
		},
		setHeader(name: string, value: string) {
			res.headers[name] = value
		},
	}
	return res
}

const request = (authorization?: string) =>
	({ headers: authorization ? { authorization } : {} }) as Request

afterEach(() => {
	delete process.env.METRICS_TOKEN
})

describe("serveMetrics", () => {
	it("stays hidden unless an operator configures a token", async () => {
		const res = response()

		await serveMetrics(request("Bearer anything"), res as unknown as Response)

		expect(res.statusCode).toBe(404)
	})

	it("refuses a scrape without the configured token", async () => {
		process.env.METRICS_TOKEN = "scrape-secret"
		const res = response()

		await serveMetrics(request("Bearer wrong-secret"), res as unknown as Response)

		expect(res.statusCode).toBe(401)
	})

	it("exposes queue depths and connections to an authorised scraper", async () => {
		process.env.METRICS_TOKEN = "scrape-secret"
		const res = response()

		await serveMetrics(request("Bearer scrape-secret"), res as unknown as Response)

		expect(res.statusCode).toBe(200)
		expect(res.body).toContain("sculpt_realtime_connections 7")
		expect(res.body).toContain("sculpt_video_queue_depth 2")
		expect(res.body).toContain("sculpt_http_request_duration_seconds")
	})
})

describe("metric labels", () => {
	it("labels requests by route template so ids never explode cardinality", () => {
		expect(routeTemplateOf("/api/images", "/versions/:versionId")).toBe(
			"/api/images/versions/:versionId"
		)
		expect(routeTemplateOf("", undefined)).toBe("unmatched")
	})

	it("groups statuses into classes", () => {
		expect(statusClassOf(204)).toBe("2xx")
		expect(statusClassOf(404)).toBe("4xx")
	})

	it("compares tokens without accepting prefixes", () => {
		expect(presentsToken("Bearer abc", "abc")).toBe(true)
		expect(presentsToken("Bearer ab", "abc")).toBe(false)
		expect(presentsToken("abc", "abc")).toBe(false)
	})
})
