export const API_URL =
	process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message)
		this.name = "ApiError"
	}

	get isUnauthorized(): boolean {
		return this.status === 401
	}

	get isForbidden(): boolean {
		return this.status === 403
	}

	get isNotFound(): boolean {
		return this.status === 404
	}
}

const FALLBACK_MESSAGES: Record<number, string> = {
	401: "Your session has expired. Sign in again to continue.",
	403: "You do not have permission to do that.",
	404: "We could not find what you were looking for.",
	429: "You are going a little fast. Wait a moment and try again.",
	500: "Something went wrong on the server. Try again shortly.",
}

const messageFor = async (response: Response): Promise<string> => {
	try {
		const body = await response.json()
		if (body && typeof body.message === "string" && body.message) {
			return body.message
		}
	} catch {
		/* body was empty or not JSON */
	}
	return (
		FALLBACK_MESSAGES[response.status] ||
		`Request failed with status ${response.status}.`
	)
}

export interface RequestOptions {
	method?: string
	body?: unknown
	signal?: AbortSignal
	headers?: Record<string, string>
}

const buildUrl = (path: string): string =>
	path.startsWith("http") ? path : `${API_URL}${path}`

export const apiRequest = async <T>(
	path: string,
	options: RequestOptions = {}
): Promise<T> => {
	const isFormData =
		typeof FormData !== "undefined" && options.body instanceof FormData

	const response = await fetch(buildUrl(path), {
		method: options.method ?? "GET",
		credentials: "include",
		signal: options.signal,
		headers: {
			...(isFormData || options.body === undefined
				? {}
				: { "Content-Type": "application/json" }),
			...options.headers,
		},
		body: isFormData
			? (options.body as FormData)
			: options.body === undefined
				? undefined
				: JSON.stringify(options.body),
	})

	if (!response.ok) {
		throw new ApiError(response.status, await messageFor(response))
	}

	if (response.status === 204) return undefined as T

	const text = await response.text()
	return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
	get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
		apiRequest<T>(path, { ...options, method: "GET" }),
	post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		apiRequest<T>(path, { ...options, method: "POST", body }),
	put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		apiRequest<T>(path, { ...options, method: "PUT", body }),
	patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		apiRequest<T>(path, { ...options, method: "PATCH", body }),
	delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		apiRequest<T>(path, { ...options, method: "DELETE", body }),
}

export interface Paginated<T> {
	items: T[]
	total: number
	page: number
	pageSize: number
	totalPages: number
}

export interface UploadProgress {
	loaded: number
	total: number
	percent: number
}

export const uploadWithProgress = <T>(
	path: string,
	formData: FormData,
	onProgress?: (progress: UploadProgress) => void,
	signal?: AbortSignal
): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const request = new XMLHttpRequest()
		request.open("POST", buildUrl(path))
		request.withCredentials = true

		request.upload.onprogress = (event) => {
			if (!event.lengthComputable || !onProgress) return
			onProgress({
				loaded: event.loaded,
				total: event.total,
				percent: Math.round((event.loaded / event.total) * 100),
			})
		}

		request.onload = () => {
			const raw = request.responseText
			if (request.status >= 200 && request.status < 300) {
				try {
					resolve((raw ? JSON.parse(raw) : undefined) as T)
				} catch {
					reject(new ApiError(request.status, "The server sent an unreadable response."))
				}
				return
			}

			let message = FALLBACK_MESSAGES[request.status] || "Upload failed."
			try {
				const parsed = JSON.parse(raw)
				if (parsed?.message) message = parsed.message
			} catch {
				/* keep the fallback */
			}
			reject(new ApiError(request.status, message))
		}

		request.onerror = () =>
			reject(new ApiError(0, "The upload could not reach the server."))
		request.onabort = () => reject(new ApiError(0, "Upload cancelled."))

		signal?.addEventListener("abort", () => request.abort(), { once: true })

		request.send(formData)
	})
