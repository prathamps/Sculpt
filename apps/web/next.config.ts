import type { NextConfig } from "next"

const apiOrigin = (
	process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
).replace(/\/+$/, "")

const nextConfig: NextConfig = {
	output: "standalone",
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
	eslint: {
		ignoreDuringBuilds: true,
	},
}

export default nextConfig
