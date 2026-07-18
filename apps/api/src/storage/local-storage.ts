import fs from "fs/promises"
import path from "path"
import { IncomingFile, StoragePort } from "./storage"

export class LocalStorage implements StoragePort {
	constructor(private readonly uploadsDir: string) {}

	async store(file: IncomingFile): Promise<string> {
		const fileName = path.basename(file.path)
		await fs.mkdir(this.uploadsDir, { recursive: true })
		await fs.rename(file.path, path.join(this.uploadsDir, fileName))
		return `uploads/${fileName}`
	}

	async remove(url: string): Promise<void> {
		const target = path.join(this.uploadsDir, path.basename(url))
		await fs.unlink(target).catch(() => undefined)
	}
}
