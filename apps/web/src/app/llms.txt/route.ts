const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "")
const INTEGRATION_FETCH_TIMEOUT_MS = 3000

export const revalidate = 300

interface IntegrationInfo {
	mcpServerUrl: string | null
	authorizationServer: string
	scopes: { scope: string; title: string; description: string }[]
}

const integrationInfo = async (): Promise<IntegrationInfo | null> => {
	try {
		const response = await fetch(`${API_URL}/api/oauth/integration`, {
			signal: AbortSignal.timeout(INTEGRATION_FETCH_TIMEOUT_MS),
		})
		return response.ok ? ((await response.json()) as IntegrationInfo) : null
	} catch {
		return null
	}
}

const describe = (info: IntegrationInfo | null, origin: string): string =>
	[
		"# Sculpt",
		"",
		"> Sculpt is an open-source visual review platform. Teams upload images, videos, PDFs and 3D models into projects, then review them with location-anchored comments, drawn annotations and approve / request-changes decisions.",
		"",
		"## For AI agents",
		"",
		info?.mcpServerUrl
			? `- MCP server (Streamable HTTP, OAuth 2.1): ${info.mcpServerUrl}`
			: "- MCP server: not enabled on this instance.",
		`- OAuth authorization server: ${info?.authorizationServer ?? API_URL} (metadata at /.well-known/oauth-authorization-server; dynamic client registration and Client ID Metadata Documents supported; PKCE S256 required)`,
		`- REST API: ${API_URL}/api, documented in docs/openapi.yaml. Authenticate with an OAuth access token for this API or a personal access token (Authorization: Bearer sculpt_pat_…).`,
		`- Set-up guide for people: ${origin}/account/integrations`,
		"",
		"## Permissions",
		"",
		...(info?.scopes ?? []).map((scope) => `- ${scope.scope}: ${scope.title}. ${scope.description}`),
		"",
		"Delegated access never exceeds the person's own project role. Password, two-factor, account deletion and token management are only possible in a signed-in browser session.",
		"",
		"## Domain model",
		"",
		"- Project → folders → media items → numbered versions.",
		"- Comments, drawn annotations (coordinates are fractions of width and height from the top-left), video timestamps, PDF pages, 3D anchors and review decisions belong to a version.",
		"- Roles per project: VIEWER < MEMBER < EDITOR < OWNER.",
		"",
	].join("\n")

export const GET = async (request: Request): Promise<Response> =>
	new Response(describe(await integrationInfo(), new URL(request.url).origin), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	})
