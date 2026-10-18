import { createHash, randomBytes } from "crypto"

const API = process.env.SCULPT_API_URL ?? "http://localhost:3001"
const MCP_RESOURCE = process.env.MCP_RESOURCE_URL ?? "http://localhost:3002/mcp"
const MCP_SECRET = process.env.MCP_CLIENT_SECRET ?? "sculpt-mcp-development-secret-do-not-deploy"
const ORIGIN = process.env.FRONTEND_URL ?? "http://localhost:3000"

const assert = (condition, message) => {
	if (!condition) {
		console.error("FAIL:", message)
		process.exit(1)
	}
	console.log("ok -", message)
}

const email = `e2e-${Date.now()}@example.com`
const password = "Sup3r-secret-passw0rd!"

const json = async (response) => {
	const text = await response.text()
	try { return JSON.parse(text) } catch { return text }
}

const register = await fetch(`${API}/api/auth/register`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Origin: ORIGIN },
	body: JSON.stringify({ email, password, name: "E2E Person" }),
})
assert(register.status === 201, `register user (${register.status})`)

const login = await fetch(`${API}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Origin: ORIGIN },
	body: JSON.stringify({ email, password }),
})
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
assert(login.status === 200 && cookie.includes("token="), "log in and get a session cookie")

const redirectUri = "http://127.0.0.1:9999/callback"
const registration = await fetch(`${API}/oauth/register`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Origin: "https://claude.ai" },
	body: JSON.stringify({ client_name: "E2E Agent", redirect_uris: [redirectUri] }),
})
const client = await json(registration)
assert(registration.status === 201 && client.client_id, "dynamically register a public client")
assert(registration.headers.get("access-control-allow-origin") === "*", "registration is CORS-open")

const verifier = randomBytes(32).toString("base64url")
const challenge = createHash("sha256").update(verifier).digest("base64url")
const startAuthorization = async () => {
	const authorizeUrl = new URL(`${API}/oauth/authorize`)
	Object.entries({
		response_type: "code",
		client_id: client.client_id,
		redirect_uri: "http://127.0.0.1:51234/callback",
		code_challenge: challenge,
		code_challenge_method: "S256",
		state: "xyz",
		resource: MCP_RESOURCE,
		scope: "sculpt:read sculpt:content offline_access",
	}).forEach(([k, v]) => authorizeUrl.searchParams.set(k, v))
	const response = await fetch(authorizeUrl, { redirect: "manual" })
	return { response, location: new URL(response.headers.get("location")) }
}

const consentDetails = (sessionCookie, request) =>
	fetch(`${API}/api/oauth/consent/details`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: sessionCookie, Origin: ORIGIN },
		body: JSON.stringify({ request }),
	})

const decide = (sessionCookie, request) =>
	fetch(`${API}/api/oauth/consent`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: sessionCookie, Origin: ORIGIN },
		body: JSON.stringify({ request, approved: true }),
	})

const redeem = async (redirect) =>
	json(
		await fetch(`${API}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: new URL(redirect).searchParams.get("code"),
				client_id: client.client_id,
				code_verifier: verifier,
			}),
		})
	)

const refresh = (refreshToken) =>
	fetch(`${API}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: client.client_id }),
	})

const { response: authorize, location: consentLocation } = await startAuthorization()
const handle = consentLocation.searchParams.get("request")
assert(authorize.status === 302 && consentLocation.pathname === "/consent" && handle, "authorize redirects to consent (loopback port may vary)")

const details = await json(await consentDetails(cookie, handle))
assert(details.client?.name === "E2E Agent" && details.scopes.length === 2 && details.resource.kind === "mcp" && details.autoApprove === false, "consent details describe client, scopes and resource")
assert(details.identity?.verified === false && details.identity?.runsLocally === true, "consent details say the app is unverified and runs on the person's computer")

const decision = await fetch(`${API}/api/oauth/consent`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
	body: JSON.stringify({ request: handle, approved: true }),
})
const { redirectTo } = await json(decision)
const callback = new URL(redirectTo)
const code = callback.searchParams.get("code")
assert(code && callback.searchParams.get("state") === "xyz" && callback.searchParams.get("iss") === API, "approval redirects with code, state and iss")

const tokenResponse = await fetch(`${API}/oauth/token`, {
	method: "POST",
	headers: { "Content-Type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({
		grant_type: "authorization_code",
		code,
		client_id: client.client_id,
		code_verifier: verifier,
		redirect_uri: "http://127.0.0.1:51234/callback",
		resource: MCP_RESOURCE,
	}),
})
const tokens = await json(tokenResponse)
assert(tokenResponse.status === 200 && tokens.access_token && tokens.refresh_token, "exchange the code for access and refresh tokens")
assert(tokens.scope === "sculpt:read sculpt:content", `scope is narrowed to what was granted (${tokens.scope})`)

const replay = await fetch(`${API}/oauth/token`, {
	method: "POST",
	headers: { "Content-Type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: client.client_id, code_verifier: verifier }),
})
assert(replay.status === 400, "replaying the code is rejected")

const reusedRequest = await decide(cookie, handle)
assert(reusedRequest.status === 400, "a sign-in request can be decided only once")

const handle2 = (await startAuthorization()).location.searchParams.get("request")
const reconsent = await json(await consentDetails(cookie, handle2))
assert(reconsent.autoApprove === false, "code replay revoked the grant, so consent is asked again")

const decision2 = await json(await decide(cookie, handle2))
const tokens2 = await redeem(decision2.redirectTo)
assert(tokens2.access_token, "a fresh consent issues fresh tokens")

const direct = await fetch(`${API}/api/projects`, { headers: { Authorization: `Bearer ${tokens2.access_token}` } })
assert(direct.status === 401 && (direct.headers.get("www-authenticate") ?? "").includes("resource_metadata"), "an MCP-audience token is refused by the API (no passthrough)")

const exchange = await fetch(`${API}/oauth/token`, {
	method: "POST",
	headers: {
		"Content-Type": "application/x-www-form-urlencoded",
		Authorization: `Basic ${Buffer.from(`sculpt-mcp:${MCP_SECRET}`).toString("base64")}`,
	},
	body: new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
		subject_token: tokens2.access_token,
		subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
		resource: API,
	}),
})
const delegated = await json(exchange)
assert(exchange.status === 200 && delegated.access_token && delegated.issued_token_type, "the MCP service exchanges the token for an API token")
const payload = JSON.parse(Buffer.from(delegated.access_token.split(".")[1], "base64url").toString())
assert(payload.aud === API && payload.act?.sub === "sculpt-mcp" && payload.client_id === client.client_id, "the API token names the API audience, the client and the acting service")

const wrongSecret = await fetch(`${API}/oauth/token`, {
	method: "POST",
	headers: {
		"Content-Type": "application/x-www-form-urlencoded",
		Authorization: `Basic ${Buffer.from("sculpt-mcp:wrong").toString("base64")}`,
	},
	body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: tokens2.access_token, subject_token_type: "urn:ietf:params:oauth:token-type:access_token" }),
})
assert(wrongSecret.status === 401, "token exchange needs the MCP service secret")

const publicExchange = await fetch(`${API}/oauth/token`, {
	method: "POST",
	headers: { "Content-Type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", client_id: client.client_id, subject_token: tokens2.access_token, subject_token_type: "urn:ietf:params:oauth:token-type:access_token" }),
})
assert(publicExchange.status === 400 && (await json(publicExchange)).error === "unauthorized_client", "ordinary clients cannot exchange tokens")

const bearer = { Authorization: `Bearer ${delegated.access_token}`, "Content-Type": "application/json" }
const list = await fetch(`${API}/api/projects`, { headers: bearer })
assert(list.status === 200, "the API token lists projects")

const created = await fetch(`${API}/api/projects`, { method: "POST", headers: { ...bearer, Origin: "https://evil.example" }, body: JSON.stringify({ name: "Made by an agent" }) })
const project = await json(created)
assert(created.status === 201 && project.id, "the API token creates a project (content scope; CSRF check does not apply to bearer)")

const comment = await fetch(`${API}/api/projects/${project.id}`, { method: "PUT", headers: bearer, body: JSON.stringify({ name: "Renamed" }) })
const commentBody = await json(comment)
assert(comment.status === 403 && commentBody.code === "insufficient_scope" && commentBody.requiredScope === "sculpt:manage", "renaming needs the manage scope, which was not granted")

const passwordChange = await fetch(`${API}/api/users/me/password`, { method: "POST", headers: bearer, body: JSON.stringify({ currentPassword: "x", newPassword: "y" }) })
assert(passwordChange.status === 403, "password changes are session-only")

const admin = await fetch(`${API}/api/admin/stats`, { headers: bearer })
assert(admin.status === 401, "the admin console refuses bearer tokens")

const audit = await fetch(`${API}/api/projects/${project.id}`, { headers: bearer })
assert(audit.status === 200, "the agent can read the project it created")

const refreshed = await fetch(`${API}/oauth/token`, {
	method: "POST",
	headers: { "Content-Type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens2.refresh_token, client_id: client.client_id }),
})
const rotated = await json(refreshed)
assert(refreshed.status === 200 && rotated.refresh_token && rotated.refresh_token !== tokens2.refresh_token, "refresh rotates the refresh token")

const reuse = await fetch(`${API}/oauth/token`, {
	method: "POST",
	headers: { "Content-Type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens2.refresh_token, client_id: client.client_id }),
})
assert(reuse.status === 400, "reusing a spent refresh token is rejected")

await new Promise((resolve) => setTimeout(resolve, 5500))
const afterReuse = await fetch(`${API}/api/projects`, { headers: bearer })
assert(afterReuse.status === 401, "refresh-token reuse revoked the grant, so even the live API token stops working")

const unconfirmedPat = await fetch(`${API}/api/users/me/tokens`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
	body: JSON.stringify({ name: "CLI", scopes: ["sculpt:read"] }),
})
assert(unconfirmedPat.status === 400, "creating a personal access token asks for the password again")

const patResponse = await fetch(`${API}/api/users/me/tokens`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
	body: JSON.stringify({ name: "CLI", scopes: ["sculpt:read"], expiresInDays: 30, password }),
})
const pat = await json(patResponse)
assert(patResponse.status === 201 && pat.token.startsWith("sculpt_pat_"), "create a personal access token")
const patList = await fetch(`${API}/api/projects`, { headers: { Authorization: `Bearer ${pat.token}` } })
assert(patList.status === 200, "the personal access token reads projects")
const patWrite = await fetch(`${API}/api/projects`, { method: "POST", headers: { Authorization: `Bearer ${pat.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "nope" }) })
assert(patWrite.status === 403, "a read-only token cannot create projects")
const patTokens = await fetch(`${API}/api/users/me/tokens`, { headers: { Authorization: `Bearer ${pat.token}` } })
assert(patTokens.status === 403, "a token cannot manage tokens")

const introspection = await json(
	await fetch(`${API}/oauth/introspect`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`sculpt-mcp:${MCP_SECRET}`).toString("base64")}` },
		body: new URLSearchParams({ token: pat.token }),
	})
)
assert(introspection.active === true && introspection.scope === "sculpt:read", "the MCP service can introspect a personal access token")

await fetch(`${API}/api/users/me/tokens/${pat.id}`, { method: "DELETE", headers: { Cookie: cookie, Origin: ORIGIN } })
await new Promise((resolve) => setTimeout(resolve, 100))
const revokedPat = await fetch(`${API}/api/projects`, { headers: { Authorization: `Bearer ${pat.token}` } })
assert(revokedPat.status === 401, "a revoked personal access token stops working at once")

const handle3 = (await startAuthorization()).location.searchParams.get("request")
const beforeChange = await redeem((await json(await decide(cookie, handle3))).redirectTo)
const survivingPat = await json(
	await fetch(`${API}/api/users/me/tokens`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
		body: JSON.stringify({ name: "Before password change", scopes: ["sculpt:read"], password }),
	})
)
assert(beforeChange.refresh_token && survivingPat.token, "connect an app and create a token before changing the password")

const newPassword = "An0ther-secret-passw0rd!"
const realPasswordChange = await fetch(`${API}/api/users/me/password`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
	body: JSON.stringify({ currentPassword: password, newPassword }),
})
assert(realPasswordChange.ok, `change the password (${realPasswordChange.status})`)

const relogin = await fetch(`${API}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json", Origin: ORIGIN },
	body: JSON.stringify({ email, password: newPassword }),
})
const freshCookie = relogin.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
assert((await refresh(beforeChange.refresh_token)).status === 400, "a password change ends the app's refresh token")
await new Promise((resolve) => setTimeout(resolve, 5500))
const patAfterChange = await fetch(`${API}/api/projects`, { headers: { Authorization: `Bearer ${survivingPat.token}` } })
assert(patAfterChange.status === 401, "a password change revokes personal access tokens")

const handle4 = (await startAuthorization()).location.searchParams.get("request")
await redeem((await json(await decide(freshCookie, handle4))).redirectTo)
assert((await refresh(beforeChange.refresh_token)).status === 400, "reconnecting the same app never revives a refresh token from before the password change")

console.log("\nAll OAuth end-to-end checks passed.")
