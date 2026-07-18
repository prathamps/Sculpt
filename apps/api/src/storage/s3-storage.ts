import { createReadStream } from "fs"
import fs from "fs/promises"
import path from "path"
import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { IncomingFile, StoragePort } from "./storage"

export interface S3Config {
	bucket: string
	region: string
	endpoint?: string
	publicBaseUrl?: string
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
		return `${this.publicBaseUrl}/${key}`
	}

	async remove(url: string): Promise<void> {
		if (!url.startsWith(`${this.publicBaseUrl}/`)) return
		const key = url.slice(this.publicBaseUrl.length + 1)
		try {
			await this.client.send(
				new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })
			)
		} catch (error) {
			console.error(`Failed to remove object ${key} from storage`, error)
		}
	}
}
