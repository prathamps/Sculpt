import { Request, Response } from "express"
import { prisma } from "../../lib/prisma"
import safeRedis, { isRedisReady } from "../../lib/redis"
import { logger } from "../../lib/logger"

type ComponentState = "ok" | "degraded" | "down"

const checkDatabase = async (): Promise<ComponentState> => {
	try {
		await prisma.$queryRaw`SELECT 1`
		return "ok"
	} catch (error) {
		logger.error("Health check: database unreachable", error)
		return "down"
	}
}

const checkRedis = async (): Promise<ComponentState> => {
	if (!isRedisReady()) return "degraded"
	return (await safeRedis.ping()) ? "ok" : "degraded"
}

export const healthCheck = async (
	_req: Request,
	res: Response
): Promise<void> => {
	const [database, redis] = await Promise.all([checkDatabase(), checkRedis()])
	const healthy = database === "ok"

	res.status(healthy ? 200 : 503).json({
		status: healthy ? "ok" : "unhealthy",
		components: { database, redis },
	})
}
