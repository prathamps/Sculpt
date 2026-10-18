import { API_URL, ApiError, uploadWithProgress } from "@/lib/api"

export const RESUMABLE_THRESHOLD_BYTES = 32 * 1024 * 1024
const MAX_CONSECUTIVE_FAILURES = 8
const FIRST_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000
const STORAGE_PREFIX = "sculpt:resumable:"
const CHUNK_TIMEOUT_MS = 120000

export type UploadTarget = { projectId: string } | { imageId: string }

interface SessionView {
	id: string
	size: number
	offset: number
	chunkSize: number
}

export interface ChunkResponse {
	status: number
	body: unknown
}

export interface ResumableTransport {
	request: (method: string, path: string, body?: unknown) => Promise<ChunkResponse>
	sendChunk: (
		path: string,
		chunk: Blob,
		onProgress: (loaded: number) => void
	) => Promise<ChunkResponse>
	remember: (key: string, uploadId: string | null) => void
	recall: (key: string) => string | null
	sleep: (ms: number) => Promise<void>
	waitUntilOnline: () => Promise<void>
}

export const shouldUploadResumably = (files: File[]): boolean =>
	files.some((file) => file.size >= RESUMABLE_THRESHOLD_BYTES)

const targetKey = (target: UploadTarget): string =>
	"imageId" in target ? `image:${target.imageId}` : `project:${target.projectId}`

export const resumeKeyFor = (file: File, target: UploadTarget): string =>
	`${STORAGE_PREFIX}${targetKey(target)}:${file.name}:${file.size}:${file.lastModified}`

export const retryDelayMs = (failures: number): number =>
	Math.min(MAX_RETRY_DELAY_MS, FIRST_RETRY_DELAY_MS * 2 ** Math.max(0, failures - 1))

const isRetryable = (status: number): boolean =>
	status === 0 || status === 429 || status >= 500

const messageOf = (body: unknown, fallback: string): string =>
	body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
		? (body as { message: string }).message
		: fallback

const offsetOf = (body: unknown): number | null => {
	const offset = (body as { offset?: unknown } | null)?.offset
	return typeof offset === "number" && Number.isSafeInteger(offset) ? offset : null
}

const failure = (response: ChunkResponse, fallback: string): ApiError =>
	new ApiError(response.status, messageOf(response.body, fallback))

const openSession = async (
	transport: ResumableTransport,
	file: File,
	target: UploadTarget,
	key: string
): Promise<SessionView> => {
	const remembered = transport.recall(key)
	if (remembered) {
		const existing = await transport.request("GET", `/api/uploads/${remembered}`)
		if (existing.status === 200) return existing.body as SessionView
		transport.remember(key, null)
	}
	const created = await transport.request("POST", "/api/uploads", {
		...target,
		fileName: file.name,
		mimeType: file.type,
		size: file.size,
	})
	if (created.status !== 201) throw failure(created, "Could not start the upload.")
	const session = created.body as SessionView
	transport.remember(key, session.id)
	return session
}

export const uploadResumably = async (
	file: File,
	target: UploadTarget,
	onProgress: (sentBytes: number) => void,
	transport: ResumableTransport = browserTransport
): Promise<string> => {
	const key = resumeKeyFor(file, target)
	const session = await openSession(transport, file, target, key)
	let offset = session.offset
	let failures = 0
	onProgress(offset)

	while (offset < file.size) {
		const chunk = file.slice(offset, Math.min(file.size, offset + session.chunkSize))
		const sentFrom = offset
		const response = await transport
			.sendChunk(`/api/uploads/${session.id}?offset=${offset}`, chunk, (loaded) =>
				onProgress(sentFrom + loaded)
			)
			.catch((): ChunkResponse => ({ status: 0, body: null }))

		if (response.status === 200) {
			offset = offsetOf(response.body) ?? offset + chunk.size
			failures = 0
			onProgress(offset)
			continue
		}
		if (response.status === 409 && offsetOf(response.body) !== null) {
			offset = offsetOf(response.body) as number
			onProgress(offset)
			continue
		}
		if (response.status === 404) transport.remember(key, null)
		if (!isRetryable(response.status) || ++failures > MAX_CONSECUTIVE_FAILURES) {
			throw failure(response, "The upload stopped and could not resume.")
		}
		await transport.waitUntilOnline()
		await transport.sleep(retryDelayMs(failures))
	}

	return session.id
}

export const forgetResumableUpload = (
	file: File,
	target: UploadTarget,
	transport: ResumableTransport = browserTransport
): void => transport.remember(resumeKeyFor(file, target), null)

export interface MediaSubmission {
	path: string
	formData: FormData
	field: string
	files: File[]
	target: UploadTarget
	onProgress?: (percent: number) => void
}

const WHOLE = 100
const RESERVED_FOR_FINALISING = 1

export const submitMediaUpload = async <T>({
	path,
	formData,
	field,
	files,
	target,
	onProgress,
}: MediaSubmission): Promise<T> => {
	if (!shouldUploadResumably(files)) {
		files.forEach((file) => formData.append(field, file))
		return uploadWithProgress<T>(path, formData, (progress) =>
			onProgress?.(progress.percent)
		)
	}

	const totalBytes = files.reduce((sum, file) => sum + file.size, 0) || 1
	let finishedBytes = 0
	const uploadIds: string[] = []
	for (const file of files) {
		uploadIds.push(
			await uploadResumably(file, target, (sent) =>
				onProgress?.(
					Math.floor(((finishedBytes + sent) / totalBytes) * (WHOLE - RESERVED_FOR_FINALISING))
				)
			)
		)
		finishedBytes += file.size
	}
	formData.append("uploadIds", JSON.stringify(uploadIds))
	const result = await uploadWithProgress<T>(path, formData)
	files.forEach((file) => forgetResumableUpload(file, target))
	onProgress?.(WHOLE)
	return result
}

const parseBody = (text: string): unknown => {
	try {
		return text ? JSON.parse(text) : null
	} catch {
		return null
	}
}

const safeStorage = (): Storage | null => {
	try {
		return typeof window === "undefined" ? null : window.localStorage
	} catch {
		return null
	}
}

export const browserTransport: ResumableTransport = {
	request: async (method, path, body) => {
		const response = await fetch(`${API_URL}${path}`, {
			method,
			credentials: "include",
			headers: body === undefined ? undefined : { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}).catch(() => null)
		if (!response) return { status: 0, body: null }
		return { status: response.status, body: parseBody(await response.text()) }
	},
	sendChunk: (path, chunk, onProgress) =>
		new Promise((resolve) => {
			const request = new XMLHttpRequest()
			request.open("PATCH", `${API_URL}${path}`)
			request.withCredentials = true
			request.setRequestHeader("Content-Type", "application/octet-stream")
			request.upload.onprogress = (event) => onProgress(event.loaded)
			request.onload = () =>
				resolve({ status: request.status, body: parseBody(request.responseText) })
			request.timeout = CHUNK_TIMEOUT_MS
			request.onerror = () => resolve({ status: 0, body: null })
			request.ontimeout = () => resolve({ status: 0, body: null })
			request.send(chunk)
		}),
	remember: (key, uploadId) => {
		try {
			if (uploadId) safeStorage()?.setItem(key, uploadId)
			else safeStorage()?.removeItem(key)
		} catch {
			return
		}
	},
	recall: (key) => {
		try {
			return safeStorage()?.getItem(key) ?? null
		} catch {
			return null
		}
	},
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	waitUntilOnline: () =>
		typeof navigator === "undefined" || navigator.onLine
			? Promise.resolve()
			: new Promise((resolve) =>
					window.addEventListener("online", () => resolve(), { once: true })
				),
}
