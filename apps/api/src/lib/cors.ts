const hostnameOf = (origin: string): string | null => {
	try {
		return new URL(origin).hostname
	} catch {
		return null
	}
}

let cachedHosts: Set<string> | null = null
const allowedHosts = (): Set<string> => {
	if (!cachedHosts) {
		cachedHosts = new Set(
			[process.env.FRONTEND_URL, process.env.API_URL]
				.map((url) => (url ? hostnameOf(url) : null))
				.filter((host): host is string => !!host)
		)
	}
	return cachedHosts
}

export const isAllowedOrigin = (origin: string | undefined): boolean => {
	if (!origin) return true
	const host = hostnameOf(origin)
	if (!host) return false
	if (host === "localhost" || host === "127.0.0.1") return true
	if (host === "vercel.app" || host.endsWith(".vercel.app")) return true
	return allowedHosts().has(host)
}
