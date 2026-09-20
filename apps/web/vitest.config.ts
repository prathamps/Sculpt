import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const alias = { "@": path.resolve(__dirname, "./src") }

export default defineConfig({
	plugins: [react()],
	resolve: { alias },
	test: {
		globals: true,
		projects: [
			{
				plugins: [react()],
				resolve: { alias },
				test: {
					name: "logic",
					globals: true,
					environment: "node",
					include: ["src/**/*.test.ts"],
				},
			},
			{
				plugins: [react()],
				resolve: { alias },
				test: {
					name: "components",
					globals: true,
					environment: "jsdom",
					include: ["src/**/*.test.tsx"],
				},
			},
		],
	},
})
