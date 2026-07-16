import type { NextConfig } from "next"

// Derive the API hostname so uploaded media can be served via next/image.
let apiHost = "localhost"
try {
	apiHost = new URL(
		process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
	).hostname
} catch {
	// keep default
}

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "**.railway.app", pathname: "/**" },
			{ protocol: "https", hostname: "**.up.railway.app", pathname: "/**" },
			{ protocol: "https", hostname: "**.vercel.app", pathname: "/**" },
			{ protocol: "http", hostname: "localhost" },
			...(apiHost && apiHost !== "localhost"
				? [
						{
							protocol: "https" as const,
							hostname: apiHost,
							pathname: "/**",
						},
				  ]
				: []),
		],
	},
	env: {
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
}

export default nextConfig
