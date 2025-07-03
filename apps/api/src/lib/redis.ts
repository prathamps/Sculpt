import { createClient } from "redis"

console.log("Initializing Redis client...")

// Create Redis client
const redisClient = createClient({
	url: process.env.REDIS_URL || "redis://localhost:6379",
})

// Handle connection events
redisClient.on("error", (err) => {
	console.error("Redis Client Error:", err)
})

redisClient.on("connect", () => {
	console.log("Redis client connected successfully")
})

redisClient.on("reconnecting", () => {
	console.log("Redis client reconnecting...")
})

redisClient.on("ready", () => {
	console.log("Redis client is ready")
})

// Connect to Redis
;(async () => {
	try {
		console.log("Attempting to connect to Redis...")
		await redisClient.connect()
	} catch (error) {
		console.error("Failed to connect to Redis:", error)
		console.log(
			"Will continue without Redis functionality. Some features may not work properly."
		)
	}
})()

// Create a wrapper for Redis commands that falls back gracefully if Redis is unavailable
const safeRedis = {
	get: async (...args: Parameters<typeof redisClient.get>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping get operation")
				return null
			}
			return await redisClient.get(...args)
		} catch (error) {
			console.error("Redis get error:", error)
			return null
		}
	},
	set: async (...args: Parameters<typeof redisClient.set>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping set operation")
				return false
			}
			return await redisClient.set(...args)
		} catch (error) {
			console.error("Redis set error:", error)
			return false
		}
	},
	hSet: async (...args: Parameters<typeof redisClient.hSet>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping hSet operation")
				return 0
			}
			return await redisClient.hSet(...args)
		} catch (error) {
			console.error("Redis hSet error:", error)
			return 0
		}
	},
	hGet: async (...args: Parameters<typeof redisClient.hGet>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping hGet operation")
				return null
			}
			return await redisClient.hGet(...args)
		} catch (error) {
			console.error("Redis hGet error:", error)
			return null
		}
	},
	hKeys: async (...args: Parameters<typeof redisClient.hKeys>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping hKeys operation")
				return []
			}
			return await redisClient.hKeys(...args)
		} catch (error) {
			console.error("Redis hKeys error:", error)
			return []
		}
	},
	hVals: async (...args: Parameters<typeof redisClient.hVals>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping hVals operation")
				return []
			}
			return await redisClient.hVals(...args)
		} catch (error) {
			console.error("Redis hVals error:", error)
			return []
		}
	},
	sAdd: async (...args: Parameters<typeof redisClient.sAdd>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping sAdd operation")
				return 0
			}
			return await redisClient.sAdd(...args)
		} catch (error) {
			console.error("Redis sAdd error:", error)
			return 0
		}
	},
	sMembers: async (...args: Parameters<typeof redisClient.sMembers>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping sMembers operation")
				return []
			}
			return await redisClient.sMembers(...args)
		} catch (error) {
			console.error("Redis sMembers error:", error)
			return []
		}
	},
	sIsMember: async (...args: Parameters<typeof redisClient.sIsMember>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping sIsMember operation")
				return false
			}
			return await redisClient.sIsMember(...args)
		} catch (error) {
			console.error("Redis sIsMember error:", error)
			return false
		}
	},
	sRem: async (...args: Parameters<typeof redisClient.sRem>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping sRem operation")
				return 0
			}
			return await redisClient.sRem(...args)
		} catch (error) {
			console.error("Redis sRem error:", error)
			return 0
		}
	},
	del: async (...args: Parameters<typeof redisClient.del>) => {
		try {
			if (!redisClient.isOpen) {
				console.warn("Redis not connected, skipping del operation")
				return 0
			}
			return await redisClient.del(...args)
		} catch (error) {
			console.error("Redis del error:", error)
			return 0
		}
	},
}

export default safeRedis
