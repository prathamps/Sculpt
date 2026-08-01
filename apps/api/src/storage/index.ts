import path from "path"
import { StoragePort } from "./storage"
import { LocalStorage } from "./local-storage"
import { S3Storage } from "./s3-storage"
import { logger } from "../lib/logger"

export const uploadsDir = path.join(__dirname, "../../uploads")

const createStorage = (): StoragePort => {
	if (process.env.S3_BUCKET) {
		const publicBucket = process.env.S3_PRIVATE === "false"
		if (publicBucket) {
			logger.warn(
				"S3_PRIVATE=false: media is written as public bucket URLs, so project membership checks do not apply to stored files"
			)
		}
		return new S3Storage({
			bucket: process.env.S3_BUCKET,
			region: process.env.S3_REGION || "us-east-1",
			endpoint: process.env.S3_ENDPOINT || undefined,
			publicBaseUrl: process.env.S3_PUBLIC_URL || undefined,
			private: !publicBucket,
		})
	}
	return new LocalStorage(uploadsDir)
}

export const storage: StoragePort = createStorage()
export type { StoragePort, IncomingFile } from "./storage"
