#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadConfig } from "./config.js"
import { logger } from "./logger.js"
import { Caller, PERSONAL_ACCESS_TOKEN_PREFIX } from "./auth/caller.js"
import { scopesFrom } from "./scopes.js"
import { createSculptServer } from "./server/create-server.js"

const GRANTED_SCOPES_HEADER = "x-sculpt-scopes"

const fail = (message: string): never => {
	logger.error(message)
	process.exit(1)
}

const identify = async (apiUrl: string, token: string): Promise<Caller> => {
	const response = await fetch(`${apiUrl}/api/users/me`, {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
	}).catch(() => fail(`Could not reach Sculpt at ${apiUrl}. Check SCULPT_API_URL.`))
	if (response.status === 401) fail("Sculpt rejected SCULPT_ACCESS_TOKEN. Create a new one under Account → AI & integrations.")
	if (response.status === 403) fail("This access token lacks the sculpt:read permission, which the MCP server needs.")
	if (!response.ok) fail(`Sculpt returned HTTP ${response.status} when checking the access token.`)
	const profile = (await response.json()) as { id: string }
	return {
		userId: profile.id,
		scopes: scopesFrom(response.headers.get(GRANTED_SCOPES_HEADER)),
		clientId: null,
		via: "personal_access_token",
		apiToken: async () => token,
		forgetApiToken: () => undefined,
	}
}

const main = async (): Promise<void> => {
	const token = process.env.SCULPT_ACCESS_TOKEN?.trim()
	if (!token || !token.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX)) {
		fail("Set SCULPT_ACCESS_TOKEN to a personal access token (sculpt_pat_…) from Account → AI & integrations.")
	}
	const config = loadConfig({ ...process.env, NODE_ENV: "development" })
	const caller = await identify(config.apiUrl, token as string)
	const { server, tools } = createSculptServer(config, caller)
	await server.connect(new StdioServerTransport())
	logger.info("Sculpt MCP server ready on stdio", { api: config.apiUrl, tools: tools.length })
}

void main().catch((error) => {
	logger.error("Sculpt MCP server stopped", error)
	process.exit(1)
})
