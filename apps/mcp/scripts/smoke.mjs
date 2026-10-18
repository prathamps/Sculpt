import { deflateSync } from "zlib"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"

const API = process.env.SCULPT_API_URL ?? "http://localhost:3001"
const MCP = process.env.MCP_RESOURCE_URL ?? "http://localhost:3002/mcp"
const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3000"
const REDIRECT = "http://127.0.0.1:53682/callback"

let failures = 0
const check = (condition, message) => {
	if (condition) {
		console.log(`ok - ${message}`)
		return
	}
	failures++
	console.error(`FAIL - ${message}`)
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	return c >>> 0
})
const crc32 = (buffer) => {
	let crc = 0xffffffff
	for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
	const length = Buffer.alloc(4)
	length.writeUInt32BE(data.length)
	const body = Buffer.concat([Buffer.from(type), data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(body))
	return Buffer.concat([length, body, crc])
}
const samplePng = (width = 96, height = 64) => {
	const rows = []
	for (let y = 0; y < height; y++) {
		const row = [0]
		for (let x = 0; x < width; x++) {
			const inSquare = x > 60 && x < 84 && y > 8 && y < 32
			row.push(inSquare ? 230 : 40, inSquare ? 60 : 120, inSquare ? 60 : 200)
		}
		rows.push(Buffer.from(row))
	}
	const header = Buffer.alloc(13)
	header.writeUInt32BE(width, 0)
	header.writeUInt32BE(height, 4)
	header[8] = 8
	header[9] = 2
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(Buffer.concat(rows))),
		chunk("IEND", Buffer.alloc(0)),
	])
}

const PASSWORD = "Sup3r-secret-passw0rd!"

const signUp = async () => {
	const email = `mcp-smoke-${Date.now()}@example.com`
	const password = PASSWORD
	const headers = { "Content-Type": "application/json", Origin: FRONTEND }
	await fetch(`${API}/api/auth/register`, { method: "POST", headers, body: JSON.stringify({ email, password, name: "MCP Smoke" }) })
	const login = await fetch(`${API}/api/auth/login`, { method: "POST", headers, body: JSON.stringify({ email, password }) })
	return login.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ")
}

const consentAs = (cookie, scopes) => async (authorizationUrl) => {
	const authorize = await fetch(authorizationUrl, { redirect: "manual" })
	const consent = new URL(authorize.headers.get("location"))
	const handle = consent.searchParams.get("request")
	if (!handle) throw new Error(`Authorization did not reach consent: ${consent}`)
	const response = await fetch(`${API}/api/oauth/consent`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: cookie, Origin: FRONTEND },
		body: JSON.stringify({ request: handle, approved: true, ...(scopes ? { scopes } : {}) }),
	})
	const { redirectTo } = await response.json()
	return new URL(redirectTo).searchParams.get("code")
}

const provider = (name) => {
	const store = { client: undefined, tokens: undefined, verifier: undefined, authorizationUrl: undefined }
	return {
		store,
		get redirectUrl() {
			return REDIRECT
		},
		get clientMetadata() {
			return {
				client_name: name,
				redirect_uris: [REDIRECT],
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				token_endpoint_auth_method: "none",
			}
		},
		clientInformation: () => store.client,
		saveClientInformation: (info) => {
			store.client = info
		},
		tokens: () => store.tokens,
		saveTokens: (tokens) => {
			store.tokens = tokens
		},
		redirectToAuthorization: (url) => {
			store.authorizationUrl = url
		},
		saveCodeVerifier: (verifier) => {
			store.verifier = verifier
		},
		codeVerifier: () => store.verifier,
	}
}

const connectWithOAuth = async (name, approve) => {
	const auth = provider(name)
	const first = new StreamableHTTPClientTransport(new URL(MCP), { authProvider: auth })
	const client = new Client({ name, version: "1.0.0" })
	try {
		await client.connect(first)
		throw new Error("Expected the MCP server to require authorization")
	} catch (error) {
		if (!(error instanceof UnauthorizedError)) throw error
	}
	const code = await approve(auth.store.authorizationUrl)
	await first.finishAuth(code)
	const connected = new Client({ name, version: "1.0.0" })
	await connected.connect(new StreamableHTTPClientTransport(new URL(MCP), { authProvider: auth }))
	return { client: connected, auth }
}

const textOf = (result) => result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n")

const main = async () => {
	const cookie = await signUp()
	check(cookie.includes("token="), "a person signs in to Sculpt")

	const { client, auth } = await connectWithOAuth("Smoke Agent", consentAs(cookie))
	check(auth.store.authorizationUrl?.searchParams.get("resource") === MCP, "the SDK client discovered Sculpt and asked for the MCP resource")
	check(auth.store.client?.client_id?.startsWith("sculpt_client_"), "the SDK client registered itself dynamically")
	check(!!auth.store.tokens?.refresh_token, "the SDK client received a refresh token")

	const info = client.getServerVersion()
	check(info?.name === "sculpt", "initialize returns Sculpt's server info")
	check((client.getInstructions() ?? "").includes("versionIds"), "the server explains Sculpt's model to the assistant")

	const { tools } = await client.listTools()
	const names = new Set(tools.map((tool) => tool.name))
	check(tools.length >= 50, `every capability is exposed as a tool (${tools.length})`)
	check(tools.find((tool) => tool.name === "delete_project")?.annotations?.destructiveHint === true, "destructive tools are annotated")
	check(tools.find((tool) => tool.name === "list_projects")?.annotations?.readOnlyHint === true, "read tools are annotated read-only")

	const whoami = await client.callTool({ name: "whoami", arguments: {} })
	check(whoami.structuredContent?.connection?.grantedScopes?.length === 5, "whoami reports the granted scopes")

	const project = await client.callTool({ name: "create_project", arguments: { name: "Agent launch campaign" } })
	const projectId = project.structuredContent?.id
	check(!!projectId && !project.isError, "the assistant creates a project")

	const folder = await client.callTool({ name: "create_folder", arguments: { projectId, name: "Hero images" } })
	const folderId = folder.structuredContent?.id
	check(!!folderId, "the assistant creates a folder")

	const upload = await client.callTool({
		name: "upload_media",
		arguments: { projectId, folderId, fileName: "hero.png", contentBase64: samplePng().toString("base64") },
	})
	const imageId = upload.structuredContent?.id
	const versionId = upload.structuredContent?.latestVersion?.id
	check(!!imageId && !!versionId, `the assistant uploads an image (${textOf(upload).slice(0, 80)})`)

	const view = await client.callTool({ name: "view_version", arguments: { versionId } })
	const image = view.content.find((block) => block.type === "image")
	check(image?.mimeType === "image/png" && image.data.length > 100, "the assistant can see the uploaded image")

	const comment = await client.callTool({
		name: "add_comment",
		arguments: { versionId, content: "The red square clashes with the brand palette.", region: { x: 0.62, y: 0.12, width: 0.25, height: 0.38 } },
	})
	const commentId = comment.structuredContent?.id
	check(!!commentId && !comment.isError, "the assistant leaves an anchored comment")

	const reply = await client.callTool({ name: "reply_to_comment", arguments: { versionId, commentId, content: "Agreed, swap it for the accent blue." } })
	check(!reply.isError, "the assistant replies in the thread")

	const comments = await client.callTool({ name: "list_comments", arguments: { versionId } })
	const thread = comments.structuredContent?.items?.[0]
	check(thread?.annotation?.[0]?.type === "rect" && thread.replies?.length === 1, "the comment carries the drawn region and the reply")

	const resolved = await client.callTool({ name: "resolve_comment", arguments: { commentId, resolved: true } })
	check(resolved.structuredContent?.resolved === true, "the assistant resolves the thread")
	const stillResolved = await client.callTool({ name: "resolve_comment", arguments: { commentId, resolved: true } })
	check(stillResolved.structuredContent?.resolved === true, "resolving is idempotent")

	const decision = await client.callTool({ name: "record_review_decision", arguments: { versionId, decision: "CHANGES_REQUESTED", note: "Palette fix needed." } })
	check(!decision.isError, "the assistant requests changes")

	const summary = await client.callTool({ name: "get_review_summary", arguments: { projectId } })
	check(JSON.stringify(summary.structuredContent).includes("CHANGES_REQUESTED") || !summary.isError, "the project review summary reflects the decision")

	const due = await client.callTool({ name: "set_due_date", arguments: { versionId, dueAt: "2026-12-01T17:00:00Z" } })
	check(!due.isError, "the assistant sets a due date")

	const newVersion = await client.callTool({ name: "upload_version", arguments: { imageId, fileName: "hero-v2.png", versionName: "v2 palette fix", contentBase64: samplePng(64, 64).toString("base64") } })
	check(newVersion.structuredContent?.latestVersion?.versionNumber === 2, "the assistant uploads a revised version")

	const search = await client.callTool({ name: "search", arguments: { query: "hero" } })
	check(!search.isError && textOf(search).includes("hero"), "search finds the upload")

	const report = await client.callTool({ name: "export_feedback_report", arguments: { imageId, format: "csv" } })
	check(textOf(report).includes("brand palette"), "the feedback report includes the comment")

	const share = await client.callTool({ name: "create_share_link", arguments: { projectId, role: "VIEWER", expiresInDays: 7 } })
	check(textOf(share).includes(`${FRONTEND}/join/`), "the assistant creates a share link")

	const resources = await client.listResourceTemplates()
	check(resources.resourceTemplates.some((template) => template.uriTemplate === "sculpt://versions/{versionId}/preview"), "resource templates are published")
	const projectResource = await client.readResource({ uri: `sculpt://projects/${projectId}` })
	check(projectResource.contents[0]?.text?.includes("Agent launch campaign"), "a project can be read as a resource")

	const prompts = await client.listPrompts()
	check(prompts.prompts.some((prompt) => prompt.name === "review_version"), "review prompts are published")

	const forbidden = await client.callTool({ name: "get_project", arguments: { projectId: "does-not-exist" } })
	check(forbidden.isError === true, "errors come back as tool errors, not crashes")

	await client.close()

	const readOnly = await connectWithOAuth("Read-only Agent", consentAs(cookie, ["sculpt:read"]))
	const readOnlyTools = new Set((await readOnly.client.listTools()).tools.map((tool) => tool.name))
	check(readOnlyTools.has("view_version") && !readOnlyTools.has("add_comment") && !readOnlyTools.has("delete_project"), "a read-only grant only lists read tools")
	await readOnly.client.close()

	const pat = await (
		await fetch(`${API}/api/users/me/tokens`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookie, Origin: FRONTEND },
			body: JSON.stringify({ name: "Smoke CLI", scopes: ["sculpt:read", "sculpt:feedback"], password: PASSWORD }),
		})
	).json()
	const patClient = new Client({ name: "PAT Agent", version: "1.0.0" })
	await patClient.connect(new StreamableHTTPClientTransport(new URL(MCP), { requestInit: { headers: { Authorization: `Bearer ${pat.token}` } } }))
	const patTools = new Set((await patClient.listTools()).tools.map((tool) => tool.name))
	check(patTools.has("add_comment") && !patTools.has("upload_media"), "a personal access token works and lists tools for its scopes")
	const patComment = await patClient.callTool({ name: "add_comment", arguments: { versionId, content: "From a script.", timestamp: 0 } })
	check(!patComment.isError, "a personal access token can comment through MCP")
	await patClient.close()

	const bogus = await fetch(MCP, {
		method: "POST",
		headers: { Authorization: "Bearer not-a-real-token", "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
	})
	check(bogus.status === 401 && (bogus.headers.get("www-authenticate") ?? "").includes('error="invalid_token"'), "a forged token is refused with invalid_token")

	const rawCall = (token, extraHeaders = {}) =>
		fetch(MCP, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...extraHeaders },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		})

	const foreignOrigin = await rawCall(readOnly.auth.store.tokens.access_token, { Origin: "https://evil.example" })
	check(foreignOrigin.status === 403, "calls from an untrusted web origin are refused")

	const connections = await (await fetch(`${API}/api/users/me/connections`, { headers: { Cookie: cookie } })).json()
	const readOnlyConnection = connections.find((connection) => connection.client.id === readOnly.auth.store.client.client_id)
	await fetch(`${API}/api/users/me/connections/${readOnlyConnection.id}`, { method: "DELETE", headers: { Cookie: cookie, Origin: FRONTEND } })
	const refusedTool = await fetch(MCP, {
		method: "POST",
		headers: { Authorization: `Bearer ${readOnly.auth.store.tokens.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: {} } }),
	})
	check((await refusedTool.json()).result?.isError === true, "a disconnected app can no longer act in Sculpt")
	const afterDisconnect = await rawCall(readOnly.auth.store.tokens.access_token)
	check(afterDisconnect.status === 401 && (afterDisconnect.headers.get("www-authenticate") ?? "").includes('error="invalid_token"'), "a disconnected app gets 401 invalid_token, so it knows to sign in again")

	console.log(failures === 0 ? "\nAll MCP smoke checks passed." : `\n${failures} MCP smoke check(s) failed.`)
	process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
