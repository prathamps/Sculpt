import { api } from "./api"

export type Scope =
	| "sculpt:read"
	| "sculpt:feedback"
	| "sculpt:content"
	| "sculpt:manage"
	| "sculpt:account"

export interface ScopeDescription {
	scope: Scope
	title: string
	description: string
}

export interface IntegrationInfo {
	mcpServerUrl: string | null
	authorizationServer: string
	scopes: ScopeDescription[]
}

export interface Connection {
	id: string
	scopes: Scope[]
	resource: string
	createdAt: string
	lastUsedAt: string | null
	client: {
		id: string
		name: string
		kind: "DYNAMIC" | "METADATA_DOCUMENT" | "FIRST_PARTY"
		clientUri: string | null
		logoUri: string | null
		disabled: boolean
		verified: boolean
		redirectHosts: string[]
	}
}

export interface PersonalAccessToken {
	id: string
	name: string
	lastFour: string
	scopes: Scope[]
	expiresAt: string | null
	lastUsedAt: string | null
	createdAt: string
	expired?: boolean
}

export interface CreatedPersonalAccessToken extends PersonalAccessToken {
	token: string
}

export interface ClientIdentity {
	verified: boolean
	identityHost: string | null
	redirectHost: string
	runsLocally: boolean
	nameMatchesHost: boolean
	registeredAt: string | null
}

export interface ConsentDetails {
	client: {
		id: string
		name: string
		kind: Connection["client"]["kind"]
		clientUri: string | null
		logoUri: string | null
		verified: boolean
	}
	identity: ClientIdentity
	redirectHost: string
	resource: { url: string; kind: "mcp" | "api" | "other" }
	scopes: ScopeDescription[]
	recommendedScopes: Scope[]
	previouslyGranted: Scope[]
	rememberedScopes: Scope[]
	autoApprove: boolean
}

export const initialConsentSelection = (details: ConsentDetails): Set<Scope> =>
	new Set(
		details.scopes
			.map((scope) => scope.scope)
			.filter(
				(scope) => details.recommendedScopes.includes(scope) || details.previouslyGranted.includes(scope)
			)
	)

export type IdentityWarning = "verified" | "local" | "mismatch" | "unverified"

export const identityWarningFor = (identity: ClientIdentity): IdentityWarning => {
	if (identity.verified) return "verified"
	if (identity.runsLocally) return "local"
	return identity.nameMatchesHost ? "unverified" : "mismatch"
}

export interface IdentityProof {
	password?: string
	code?: string
}

export interface NewTokenRequest extends IdentityProof {
	name: string
	scopes: Scope[]
	expiresInDays: number
}

export const REAUTHENTICATION_REQUIRED = "reauthentication_required"

export const integrationsApi = {
	info: () => api.get<IntegrationInfo>("/api/oauth/integration"),
	connections: () => api.get<Connection[]>("/api/users/me/connections"),
	revokeConnection: (grantId: string) =>
		api.delete<void>(`/api/users/me/connections/${encodeURIComponent(grantId)}`),
	tokens: () => api.get<PersonalAccessToken[]>("/api/users/me/tokens"),
	createToken: (request: NewTokenRequest) =>
		api.post<CreatedPersonalAccessToken>("/api/users/me/tokens", request),
	revokeToken: (tokenId: string) =>
		api.delete<void>(`/api/users/me/tokens/${encodeURIComponent(tokenId)}`),
	consentDetails: (request: string) =>
		api.post<ConsentDetails>("/api/oauth/consent/details", { request }),
	decideConsent: (request: string, approved: boolean, scopes?: Scope[]) =>
		api.post<{ redirectTo: string }>("/api/oauth/consent", { request, approved, scopes }),
}


export interface ClientSetup {
	id: string
	name: string
	steps: string[]
	snippet?: string
	snippetLabel?: string
}

export const clientSetupsFor = (mcpUrl: string): ClientSetup[] => [
	{
		id: "claude",
		name: "Claude",
		steps: [
			"Open Settings → Connectors and choose Add custom connector.",
			"Name it Sculpt and paste the server URL above.",
			"Choose Connect, sign in to Sculpt and allow access.",
		],
	},
	{
		id: "claude-code",
		name: "Claude Code",
		steps: [
			"Run the command below in your terminal.",
			"Inside Claude Code, run /mcp and choose Sculpt to sign in.",
		],
		snippet: `claude mcp add --transport http sculpt ${mcpUrl}`,
		snippetLabel: "Claude Code command",
	},
	{
		id: "chatgpt",
		name: "ChatGPT",
		steps: [
			"Open Settings → Apps & Connectors and create a connector (developer mode may need to be on).",
			"Paste the server URL above and choose OAuth authentication.",
			"Sign in to Sculpt and allow access when asked.",
		],
	},
	{
		id: "cursor",
		name: "Cursor",
		steps: ["Add this to ~/.cursor/mcp.json, then open Settings → MCP and choose Login next to Sculpt."],
		snippet: JSON.stringify({ mcpServers: { sculpt: { url: mcpUrl } } }, null, 2),
		snippetLabel: "Cursor mcp.json",
	},
	{
		id: "vscode",
		name: "VS Code",
		steps: ["Add this to .vscode/mcp.json, then start the server from the MCP view and sign in."],
		snippet: JSON.stringify({ servers: { sculpt: { type: "http", url: mcpUrl } } }, null, 2),
		snippetLabel: "VS Code mcp.json",
	},
	{
		id: "headless",
		name: "Scripts & agents",
		steps: [
			"Create a personal access token below with only the permissions the agent needs.",
			"Send it as a bearer token to the MCP server, or straight to the REST API.",
		],
		snippet: `claude mcp add --transport http sculpt ${mcpUrl} \\\n  --header "Authorization: Bearer sculpt_pat_…"`,
		snippetLabel: "Token-based connection",
	},
]
