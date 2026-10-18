export class SculptApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code: string | null = null,
		readonly requiredScope: string | null = null
	) {
		super(message)
		this.name = "SculptApiError"
	}
}

export type TokenProvider = () => Promise<string>

const UNAUTHORIZED = 401

export type QueryValue = string | number | boolean | null | undefined

export interface MediaBytes {
	bytes: Buffer
	mimeType: string
}

interface ErrorBody {
	message?: unknown
	code?: unknown
	requiredScope?: unknown
}

const FALLBACK_MESSAGES: Record<number, string> = {
	401: "Sculpt no longer accepts this connection. Reconnect the app to Sculpt.",
	403: "Sculpt refused: your role in this project does not allow that.",
	404: "Sculpt could not find that item, or you cannot see it.",
	429: "Sculpt is rate limiting these requests. Wait a moment and try again.",
}

const queryString = (query: Record<string, QueryValue> | undefined): string => {
	if (!query) return ""
	const params = new URLSearchParams()
	Object.entries(query).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
	})
	const encoded = params.toString()
	return encoded ? `?${encoded}` : ""
}

const errorFrom = async (response: Response): Promise<SculptApiError> => {
	let body: ErrorBody = {}
	try {
		body = (await response.json()) as ErrorBody
	} catch {
		body = {}
	}
	const message =
		typeof body.message === "string" && body.message
			? body.message
			: FALLBACK_MESSAGES[response.status] ?? `Sculpt returned HTTP ${response.status}.`
	return new SculptApiError(
		response.status,
		message,
		typeof body.code === "string" ? body.code : null,
		typeof body.requiredScope === "string" ? body.requiredScope : null
	)
}

export const storedFileName = (storedUrl: string): string | null => {
	const withoutQuery = storedUrl.split("?")[0] ?? ""
	const name = withoutQuery.split("/").filter(Boolean).pop()
	return name ? decodeURIComponent(name) : null
}

const TOO_LARGE_TO_SHOW = "The file is too large to show inline."

export const readAtMost = async (response: Response, maxBytes: number): Promise<Buffer> => {
	if (!response.body) return Buffer.alloc(0)
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let received = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		received += value.byteLength
		if (received > maxBytes) {
			await reader.cancel()
			throw new SculptApiError(413, TOO_LARGE_TO_SHOW)
		}
		chunks.push(value)
	}
	return Buffer.concat(chunks)
}

export class SculptApi {
	constructor(
		private readonly baseUrl: string,
		private readonly token: TokenProvider,
		private readonly requestId?: string,
		private readonly onUnauthorized: () => void = () => undefined
	) {}

	private async failure(response: Response): Promise<SculptApiError> {
		if (response.status === UNAUTHORIZED) this.onUnauthorized()
		return errorFrom(response)
	}

	private async headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
		return {
			Authorization: `Bearer ${await this.token()}`,
			Accept: "application/json",
			"User-Agent": "sculpt-mcp",
			...(this.requestId ? { "X-Request-Id": this.requestId } : {}),
			...extra,
		}
	}

	private async send<T>(method: string, path: string, body?: unknown, query?: Record<string, QueryValue>): Promise<T> {
		const isForm = body instanceof FormData
		const response = await fetch(`${this.baseUrl}${path}${queryString(query)}`, {
			method,
			headers: await this.headers(
				body === undefined || isForm ? {} : { "Content-Type": "application/json" }
			),
			body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
		})
		if (!response.ok) throw await this.failure(response)
		if (response.status === 204) return undefined as T
		const contentType = response.headers.get("content-type") ?? ""
		if (!contentType.includes("json")) return (await response.text()) as T
		const text = await response.text()
		return (text ? JSON.parse(text) : undefined) as T
	}

	get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
		return this.send<T>("GET", path, undefined, query)
	}

	post<T>(path: string, body?: unknown): Promise<T> {
		return this.send<T>("POST", path, body)
	}

	put<T>(path: string, body?: unknown): Promise<T> {
		return this.send<T>("PUT", path, body)
	}

	patch<T>(path: string, body?: unknown): Promise<T> {
		return this.send<T>("PATCH", path, body)
	}

	delete<T>(path: string, body?: unknown): Promise<T> {
		return this.send<T>("DELETE", path, body)
	}

	upload<T>(path: string, form: FormData): Promise<T> {
		return this.send<T>("POST", path, form)
	}

	async media(storedUrl: string, maxBytes: number): Promise<MediaBytes> {
		const fileName = storedFileName(storedUrl)
		if (!fileName) throw new SculptApiError(404, "This version has no stored file.")
		const response = await fetch(`${this.baseUrl}/uploads/${encodeURIComponent(fileName)}`, {
			headers: await this.headers({ Accept: "*/*" }),
			redirect: "follow",
		})
		if (!response.ok) throw await this.failure(response)
		const declaredLength = Number(response.headers.get("content-length"))
		if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
			await response.body?.cancel()
			throw new SculptApiError(413, TOO_LARGE_TO_SHOW)
		}
		return {
			bytes: await readAtMost(response, maxBytes),
			mimeType: (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0] ?? "",
		}
	}
}
