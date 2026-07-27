import { isProduction } from "./config"

const hostnameOf = (origin: string): string | null => {
	try {
		return new URL(origin).hostname.toLowerCase()
	} catch {
		return null
	}
}

const configuredHosts = (): Set<string> =>
	new Set(
		[process.env.FRONTEND_URL, process.env.API_URL]
			.map((url) => (url ? hostnameOf(url) : null))
			.filter((host): host is string => !!host)
	)

const previewHostSuffixes = (): string[] =>
	(process.env.CORS_ALLOWED_HOST_SUFFIXES || "")
		.split(",")
		.map((suffix) => suffix.trim().toLowerCase().replace(/^\./, ""))
		.filter(Boolean)

const matchesSuffix = (host: string, suffix: string): boolean =>
	host === suffix || host.endsWith(`.${suffix}`)

export const isAllowedOrigin = (origin: string | undefined): boolean => {
	if (!origin) return true
	const host = hostnameOf(origin)
	if (!host) return false
	if (!isProduction() && (host === "localhost" || host === "127.0.0.1")) {
		return true
	}
	if (configuredHosts().has(host)) return true
	return previewHostSuffixes().some((suffix) => matchesSuffix(host, suffix))
}
