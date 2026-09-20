import type { NextConfig } from "next"

const apiOrigin = (
	process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
).replace(/\/+$/, "")

const socketOrigin = (
	process.env.NEXT_PUBLIC_SOCKET_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	"http://localhost:3001"
).replace(/\/+$/, "")

const connectOrigins = Array.from(
	new Set([
		apiOrigin,
		socketOrigin,
		socketOrigin.replace(/^http/, "ws"),
		apiOrigin.replace(/^http/, "ws"),
	])
)

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-ancestors 'none'",
	"form-action 'self'",
	"img-src 'self' data: blob: https:",
	"media-src 'self' blob: https:",
	"font-src 'self' data:",
	"style-src 'self' 'unsafe-inline'",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
	"worker-src 'self' blob:",
	`connect-src 'self' blob: data: ${connectOrigins.join(" ")}`,
].join("; ")

const securityHeaders = [
	{ key: "Content-Security-Policy", value: contentSecurityPolicy },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "X-Permitted-Cross-Domain-Policies", value: "none" },
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
	},
	{
		key: "Strict-Transport-Security",
		value: "max-age=31536000; includeSubDomains",
	},
]

const nextConfig: NextConfig = {
	output: "standalone",
	poweredByHeader: false,
	async headers() {
		return [{ source: "/:path*", headers: securityHeaders }]
	},
	async rewrites() {
		return [
			{
				source: "/uploads/:path*",
				destination: `${apiOrigin}/uploads/:path*`,
			},
		]
	},
	env: {
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
	},
}

export default nextConfig
