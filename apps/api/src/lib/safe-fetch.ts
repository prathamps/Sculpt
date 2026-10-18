import dns, { LookupAddress } from "dns"
import http from "http"
import https from "https"
import net from "net"
import { isPrivateAddress, withoutBrackets } from "./address-policy"

export class UnsafeFetchError extends Error {}

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_DEADLINE_MS = 10000
const DEFAULT_MAX_BYTES = 64 * 1024

type LookupCallback = (
	error: NodeJS.ErrnoException | null,
	address: string | LookupAddress[],
	family?: number
) => void

const publicOnlyLookup =
	(allowPrivate: boolean) =>
	(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void => {
		dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
			if (error) return callback(error, [])
			const list = addresses as LookupAddress[]
			const blocked = !allowPrivate && list.some((entry) => isPrivateAddress(entry.address))
			if (blocked || list.length === 0) {
				return callback(
					Object.assign(new UnsafeFetchError(`${hostname} resolves to a non-public address`), {
						code: "EUNSAFEADDRESS",
					}),
					[]
				)
			}
			if (options.all) return callback(null, list)
			const [first] = list
			callback(null, first.address, first.family)
		})
	}

const maxAgeSecondsOf = (cacheControl: string | undefined): number | null => {
	const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl ?? "")
	return match ? Number(match[1]) : null
}

export interface SafeFetchOptions {
	timeoutMs?: number
	deadlineMs?: number
	maxBytes?: number
	allowPrivateNetwork?: boolean
}

export interface SafeJsonResponse {
	body: unknown
	maxAgeSeconds: number | null
}

const requestTransport = (url: URL, allowPrivateNetwork: boolean) => {
	if (url.protocol === "https:") return https
	if (url.protocol === "http:" && allowPrivateNetwork) return http
	throw new UnsafeFetchError("Only https URLs can be fetched")
}

export const fetchPublicJson = (
	target: string,
	options: SafeFetchOptions = {}
): Promise<SafeJsonResponse> =>
	new Promise((resolve, reject) => {
		const url = new URL(target)
		const allowPrivateNetwork = options.allowPrivateNetwork ?? false
		const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
		const transport = requestTransport(url, allowPrivateNetwork)
		const literalHost = withoutBrackets(url.hostname)
		if (!allowPrivateNetwork && net.isIP(literalHost) && isPrivateAddress(literalHost)) {
			reject(new UnsafeFetchError(`${url.hostname} is a non-public address`))
			return
		}

		const request = transport.get(
			url,
			{
				lookup: publicOnlyLookup(allowPrivateNetwork) as unknown as typeof dns.lookup,
				timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				headers: { Accept: "application/json", "User-Agent": "sculpt-oauth" },
				agent: false,
			},
			(response) => {
				if (response.statusCode !== 200) {
					response.resume()
					reject(new UnsafeFetchError(`Fetching ${url.host} returned ${response.statusCode}`))
					return
				}
				const chunks: Buffer[] = []
				let received = 0
				response.on("data", (chunk: Buffer) => {
					received += chunk.length
					if (received > maxBytes) {
						request.destroy(new UnsafeFetchError("Response is too large"))
						return
					}
					chunks.push(chunk)
				})
				response.on("end", () => {
					try {
						resolve({
							body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
							maxAgeSeconds: maxAgeSecondsOf(response.headers["cache-control"]),
						})
					} catch {
						reject(new UnsafeFetchError("Response is not valid JSON"))
					}
				})
				response.on("error", reject)
			}
		)
		const deadline = setTimeout(
			() => request.destroy(new UnsafeFetchError("Request took too long")),
			options.deadlineMs ?? DEFAULT_DEADLINE_MS
		)
		request.on("close", () => clearTimeout(deadline))
		request.on("timeout", () => request.destroy(new UnsafeFetchError("Request timed out")))
		request.on("error", reject)
	})
