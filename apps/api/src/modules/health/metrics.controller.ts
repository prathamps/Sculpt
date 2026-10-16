import { timingSafeEqual } from "crypto"
import { Request, Response } from "express"
import { Gauge } from "prom-client"
import { metricsRegistry } from "../../lib/metrics"
import { io } from "../../realtime/socket"
import { videoQueueDepth } from "../media/video-pipeline"
import { imageQueueDepth } from "../media/image-pipeline"
import { notificationQueueDepth } from "../notifications/notification.service"

const gauge = (name: string, help: string, read: () => number): void => {
	new Gauge({
		name,
		help,
		registers: [metricsRegistry],
		collect() {
			this.set(read())
		},
	})
}

gauge(
	"sculpt_realtime_connections",
	"Socket.IO connections open on this instance",
	() => io.engine?.clientsCount ?? 0
)
gauge("sculpt_video_queue_depth", "Video transcodes waiting or running", videoQueueDepth)
gauge("sculpt_image_queue_depth", "Image renditions waiting or running", imageQueueDepth)
gauge(
	"sculpt_notification_queue_depth",
	"Notification fan-outs and emails waiting or running",
	notificationQueueDepth
)

const BEARER_PREFIX = "Bearer "

export const metricsToken = (): string | null =>
	process.env.METRICS_TOKEN?.trim() || null

export const presentsToken = (header: string | undefined, token: string): boolean => {
	if (!header?.startsWith(BEARER_PREFIX)) return false
	const presented = Buffer.from(header.slice(BEARER_PREFIX.length))
	const expected = Buffer.from(token)
	return presented.length === expected.length && timingSafeEqual(presented, expected)
}

export const serveMetrics = async (req: Request, res: Response): Promise<void> => {
	const token = metricsToken()
	if (!token) {
		res.status(404).json({ message: "Not found" })
		return
	}
	if (!presentsToken(req.headers.authorization, token)) {
		res.status(401).json({ message: "Unauthorized" })
		return
	}
	res.setHeader("Content-Type", metricsRegistry.contentType)
	res.send(await metricsRegistry.metrics())
}
