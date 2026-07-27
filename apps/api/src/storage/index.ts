import path from "path"
import { StoragePort } from "./storage"
import { LocalStorage } from "./local-storage"
import { S3Storage } from "./s3-storage"

export const uploadsDir = path.join(__dirname, "../../uploads")

const createStorage = (): StoragePort => {
	if (process.env.S3_BUCKET) {
		return new S3Storage({
			bucket: process.env.S3_BUCKET,
			region: process.env.S3_REGION || "us-east-1",
			endpoint: process.env.S3_ENDPOINT || undefined,
			publicBaseUrl: process.env.S3_PUBLIC_URL || undefined,
			private: process.env.S3_PRIVATE === "true",
		})
	}
	return new LocalStorage(uploadsDir)
}

export const storage: StoragePort = createStorage()
export type { StoragePort, IncomingFile } from "./storage"
