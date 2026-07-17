const hostnameOf = (origin: string): string | null => {
	try {
		return new URL(origin).hostname
	} catch {
		return null
	}
}

const allowedHosts = (): string[] => {
	const configured = [process.env.FRONTEND_URL, process.env.API_URL]
		.map((url) => (url ? hostnameOf(url) : null))
		.filter((host): host is string => !!host)
	return [...new Set(configured)]
}

// Credentialed cross-origin access is allowed only for localhost (any port),
// *.vercel.app preview/production deployments, and the configured app hosts.
// Matching is on the parsed hostname, never a substring, so lookalikes such as
// vercel.app.evil.com or sculpt-localhost.evil.com are rejected.
export const isAllowedOrigin = (origin: string | undefined): boolean => {
	if (!origin) return true
	const host = hostnameOf(origin)
	if (!host) return false
	if (host === "localhost" || host === "127.0.0.1") return true
	if (host === "vercel.app" || host.endsWith(".vercel.app")) return true
	return allowedHosts().includes(host)
}
