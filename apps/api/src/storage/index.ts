import path from "path"
import { StoragePort } from "./storage"
import { LocalStorage } from "./local-storage"
import { S3Storage, ServerSideEncryption } from "./s3-storage"
import { logger } from "../lib/logger"

export const uploadsDir = path.join(__dirname, "../../uploads")

const SUPPORTED_ENCRYPTION = new Set<ServerSideEncryption>(["AES256", "aws:kms"])

const configuredEncryption = (): ServerSideEncryption | undefined => {
	const requested = process.env.S3_SERVER_SIDE_ENCRYPTION?.trim()
	if (!requested) return undefined
	if (!SUPPORTED_ENCRYPTION.has(requested as ServerSideEncryption)) {
		throw new Error("S3_SERVER_SIDE_ENCRYPTION must be AES256 or aws:kms")
	}
	return requested as ServerSideEncryption
}

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
			serverSideEncryption: configuredEncryption(),
			kmsKeyId: process.env.S3_SSE_KMS_KEY_ID || undefined,
		})
	}
	return new LocalStorage(uploadsDir)
}

export const storage: StoragePort = createStorage()
export type { StoragePort, IncomingFile } from "./storage"
