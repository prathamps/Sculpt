import { createReadStream } from "fs"
import fs from "fs/promises"
import path from "path"
import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { IncomingFile, StoragePort } from "./storage"
import { logger } from "../lib/logger"

export interface S3Config {
	bucket: string
	region: string
	endpoint?: string
	publicBaseUrl?: string
	private?: boolean
}

export class S3Storage implements StoragePort {
	private readonly client: S3Client
	private readonly publicBaseUrl: string

	constructor(private readonly config: S3Config) {
		this.client = new S3Client({
			region: config.region,
			...(config.endpoint
				? { endpoint: config.endpoint, forcePathStyle: true }
				: {}),
		})
		this.publicBaseUrl = (
			config.publicBaseUrl ||
			(config.endpoint
				? `${config.endpoint}/${config.bucket}`
				: `https://${config.bucket}.s3.${config.region}.amazonaws.com`)
		).replace(/\/+$/, "")
	}

	async store(file: IncomingFile): Promise<string> {
		const key = path.basename(file.path)
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: key,
				Body: createReadStream(file.path),
				ContentType: file.mimeType,
			})
		)
		await fs.unlink(file.path).catch(() => undefined)
		return this.config.private ? `uploads/${key}` : `${this.publicBaseUrl}/${key}`
	}

	async remove(url: string): Promise<void> {
		const key = this.keyFor(url)
		if (!key) return
		try {
			await this.client.send(
				new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })
			)
		} catch (error) {
			logger.error("Failed to remove object from storage", error, { key })
		}
	}

	async temporaryReadUrl(
		storedPath: string,
		ttlSeconds: number
	): Promise<string> {
		return getSignedUrl(
			this.client,
			new GetObjectCommand({
				Bucket: this.config.bucket,
				Key: path.basename(storedPath),
			}),
			{ expiresIn: ttlSeconds }
		)
	}

	private keyFor(url: string): string | null {
		if (url.startsWith(`${this.publicBaseUrl}/`)) {
			return url.slice(this.publicBaseUrl.length + 1)
		}
		if (this.config.private && !/^https?:\/\//i.test(url)) {
			return path.basename(url)
		}
		return null
	}
}
