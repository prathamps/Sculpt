import dns, { LookupAddress } from "dns"
import https from "https"
import http from "http"
import net from "net"
import { isPrivateAddress, withoutBrackets } from "./address-policy.js"

export { isPrivateAddress }

export class UnsafeDownloadError extends Error {}

const DOWNLOAD_TIMEOUT_MS = 20000
const DOWNLOAD_DEADLINE_MS = 60000
const MAX_REDIRECTS = 3

type LookupCallback = (
	error: NodeJS.ErrnoException | null,
	address: string | LookupAddress[],
	family?: number
) => void

const publicLookup =
	(allowPrivate: boolean) =>
	(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void => {
		dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
			if (error) return callback(error, [])
			const list = addresses as LookupAddress[]
			if (list.length === 0 || (!allowPrivate && list.some((entry) => isPrivateAddress(entry.address)))) {
				return callback(new UnsafeDownloadError(`${hostname} is not a public address`), [])
			}
			if (options.all) return callback(null, list)
			const [first] = list
			callback(null, first?.address ?? "", first?.family)
		})
	}

export interface DownloadedFile {
	bytes: Buffer
	mimeType: string | null
	fileName: string | null
}

export interface DownloadOptions {
	maxBytes: number
	allowPrivateNetwork?: boolean
	deadlineMs?: number
}

const fileNameFrom = (url: URL): string | null => {
	const name = url.pathname.split("/").filter(Boolean).pop()
	return name ? decodeURIComponent(name) : null
}

const assertFetchable = (url: URL, allowPrivate: boolean): void => {
	if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
		throw new UnsafeDownloadError("Only https URLs can be downloaded.")
	}
	if (url.username || url.password) throw new UnsafeDownloadError("URLs with credentials are refused.")
	const host = withoutBrackets(url.hostname)
	if (!allowPrivate && net.isIP(host) && isPrivateAddress(host)) {
		throw new UnsafeDownloadError(`${url.hostname} is not a public address.`)
	}
}

const downloadOnce = (
	url: URL,
	options: DownloadOptions,
	redirectsLeft: number,
	deadline: number
): Promise<DownloadedFile> =>
	new Promise((resolve, reject) => {
		const allowPrivate = options.allowPrivateNetwork ?? false
		try {
			assertFetchable(url, allowPrivate)
		} catch (error) {
			reject(error)
			return
		}
		const remainingMs = deadline - Date.now()
		if (remainingMs <= 0) {
			reject(new UnsafeDownloadError("The download took too long."))
			return
		}
		const transport = url.protocol === "https:" ? https : http
		const request = transport.get(
			url,
			{
				lookup: publicLookup(allowPrivate) as unknown as typeof dns.lookup,
				timeout: DOWNLOAD_TIMEOUT_MS,
				headers: { "User-Agent": "sculpt-mcp" },
				agent: false,
			},
			(response) => {
				const status = response.statusCode ?? 0
				if (status >= 300 && status < 400 && response.headers.location) {
					response.resume()
					if (redirectsLeft <= 0) {
						reject(new UnsafeDownloadError("Too many redirects."))
						return
					}
					downloadOnce(new URL(response.headers.location, url), options, redirectsLeft - 1, deadline).then(
						resolve,
						reject
					)
					return
				}
				if (status !== 200) {
					response.resume()
					reject(new UnsafeDownloadError(`The URL returned HTTP ${status}.`))
					return
				}
				const chunks: Buffer[] = []
				let received = 0
				response.on("data", (chunk: Buffer) => {
					received += chunk.length
					if (received > options.maxBytes) {
						request.destroy(new UnsafeDownloadError("The file is larger than the upload limit."))
						return
					}
					chunks.push(chunk)
				})
				response.on("end", () =>
					resolve({
						bytes: Buffer.concat(chunks),
						mimeType: response.headers["content-type"]?.split(";")[0]?.trim() || null,
						fileName: fileNameFrom(url),
					})
				)
				response.on("error", reject)
			}
		)
		const deadlineTimer = setTimeout(
			() => request.destroy(new UnsafeDownloadError("The download took too long.")),
			remainingMs
		)
		request.on("close", () => clearTimeout(deadlineTimer))
		request.on("timeout", () => request.destroy(new UnsafeDownloadError("The download timed out.")))
		request.on("error", reject)
	})

export const downloadPublicFile = (target: string, options: DownloadOptions): Promise<DownloadedFile> =>
	downloadOnce(
		new URL(target),
		options,
		MAX_REDIRECTS,
		Date.now() + (options.deadlineMs ?? DOWNLOAD_DEADLINE_MS)
	)
