export interface IncomingFile {
	path: string
	originalName: string
	mimeType: string
}

export interface StoragePort {
	store(file: IncomingFile): Promise<string>
	remove(url: string): Promise<void>
}
