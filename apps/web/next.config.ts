import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "[YOUR-RAILWAY-DOMAIN]",
				pathname: "/**",
			},
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
