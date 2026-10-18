# AI integration

Sculpt is AI-first: anything a person can do in the browser, an AI assistant can
do for them — review media it can actually see, leave comments pinned to the
exact region or moment, upload revised versions, approve work, organise folders,
invite people and manage sharing. Assistants connect through a standards-based
**MCP server** and are authorised by the person with **OAuth 2.1**, so there are
no secrets to copy and every connection is scoped, visible and revocable.

## Connecting an assistant

People open **Account → AI & integrations**, copy the MCP server URL and paste
it into their assistant:

| Assistant | How |
| --- | --- |
| Claude (web, desktop, mobile) | Settings → Connectors → Add custom connector |
| Claude Code | `claude mcp add --transport http sculpt <url>`, then `/mcp` |
| ChatGPT | Settings → Apps & Connectors → create a connector with OAuth |
| Cursor | `~/.cursor/mcp.json` → `{"mcpServers": {"sculpt": {"url": "<url>"}}}` |
| VS Code | `.vscode/mcp.json` → `{"servers": {"sculpt": {"type": "http", "url": "<url>"}}}` |
| Scripts, CI, headless agents | a personal access token sent as `Authorization: Bearer sculpt_pat_…` |

The assistant discovers everything else itself. The person signs in (password,
Google or GitHub, plus two-factor if they use it), sees a consent screen that
names the app, says who it really belongs to and what it may do, and is sent
back. Viewing, giving feedback and managing files are ticked by default;
administering projects and changing the profile are offered but stay off
unless the person turns them on. Approving the same request from the same app
again later is automatic, including the choices the person made.

## Architecture

```
AI client                     apps/mcp (resource server)          apps/api (authorization + resource server)
─────────                     ──────────────────────────          ──────────────────────────────────────────
POST /mcp ─────────────────▶  401 WWW-Authenticate:
                              resource_metadata=…/oauth-protected-resource/mcp
GET  PRM ──────────────────▶  {resource, authorization_servers}
GET  /.well-known/oauth-authorization-server ───────────────────▶ RFC 8414 metadata
POST /oauth/register ───────────────────────────────────────────▶ RFC 7591 (or a Client ID Metadata Document URL)
browser → /oauth/authorize ─────────────────────────────────────▶ validate → web /consent → sign-in, MFA, consent
POST /oauth/token (code + PKCE + resource) ─────────────────────▶ access token (aud = MCP URL) + refresh token
POST /mcp  Bearer <MCP token> ▶ verify via JWKS (iss, aud, exp, typ)
                              POST /oauth/token (RFC 8693, service secret) ─▶ 5-minute API token
                                                                              aud = API, act = {sub: sculpt-mcp}
                              REST call with API token ──────────▶ bearer auth → scope check → role check
                                                                   → service → audit · notifications · sockets
```

### Why this shape

- **One source of truth for authorisation.** The MCP server never touches the
  database. Every tool is a REST call, so the API's project-role checks, content
  policy (download restrictions, internal comments), audit log, notifications and
  realtime events apply unchanged. Collaborators watch an assistant's comments
  appear live.
- **No token passthrough.** Tokens issued to AI clients have the MCP server as
  their audience (RFC 8707 resource indicators) and the API refuses them. The MCP
  server trades each one for a short-lived API-audience token with RFC 8693 token
  exchange, authenticating with a shared service secret; the new token carries an
  `act` claim naming the MCP service. Exchanged tokens are reused for at most a
  minute, and the exchange happens before a request is served, so a revoked
  connection gets `401 invalid_token` from the MCP server and its client knows
  to sign in again.
- **Stateless and horizontally scalable.** The MCP server uses Streamable HTTP in
  stateless mode, builds a server per request for the caller's scopes, verifies
  tokens locally against the API's JWKS, and keeps only in-memory caches.
- **Delegation is narrower than the person, never wider.** Scopes are intersected
  with the caller's project role on every request.
- **Revocation is immediate.** Every API request re-checks that the grant is
  live (5-second cache, the same policy as sessions); disconnecting an app or
  reusing a refresh token kills all its tokens at once.

### Scopes

Scopes map one-to-one onto project role tiers, so `requireProjectRole(minimum)`
derives the scope a token needs from the role a route already requires.

| Scope | Role tier | Covers |
| --- | --- | --- |
| `sculpt:read` | VIEWER | projects, media, versions, comments, reviews, members, folders, search, notifications, reports, profile |
| `sculpt:feedback` | MEMBER | comments, replies, drawings, likes, resolving, attachments, review decisions, clearing notifications |
| `sculpt:content` | EDITOR | creating projects, uploads and versions, renaming/moving/deleting media and folders, due dates |
| `sculpt:manage` | OWNER | project settings and deletion, members, roles, invitations, share links, joining and leaving projects |
| `sculpt:account` | — | display name and email notification preferences |

**Session-only** (refused for any token, whatever its scopes): password change,
two-factor setup, account deletion, personal data export, token and connection
management, the consent endpoints and the whole admin console.

`src/route-scopes.test.ts` walks every mounted route and fails if one is
reachable by a bearer token without either a scope declaration or `sessionOnly`.
A new endpoint therefore cannot ship without deciding who may call it.

### The authorization server (`apps/api/src/modules/oauth`)

| File | Responsibility |
| --- | --- |
| `oauth.config.ts` | issuer, API and MCP resources, lifetimes, the first-party MCP client |
| `signing-keys.service.ts` | ES256 keys generated on first use, sealed at rest, published as JWKS, rotated every 90 days |
| `access-tokens.ts` | RFC 9068 `at+jwt` access tokens bound to one audience, a grant and the user's token version |
| `clients.service.ts`, `client-metadata.ts` | dynamic registration, Client ID Metadata Documents, redirect URI rules, client authentication |
| `authorization.service.ts` | `/oauth/authorize` validation, the signed single-use consent request, consent decisions, codes |
| `client-identity.ts` | what the consent screen says about who an app really is |
| `credential-changes.ts` | which credential changes end connections and personal access tokens |
| `tokens.service.ts` | authorization code (PKCE S256), refresh rotation with reuse detection, token exchange, revocation, introspection |
| `grants.service.ts` | consent records ("connections"), liveness checks, revocation |
| `personal-tokens.service.ts` | personal access tokens |
| `bearer.ts` | bearer authentication for the API |
| `oauth.maintenance.ts` | hourly pruning of expired codes, tokens and consent requests, unused clients and retired keys; key rotation. Runs on one instance at a time (Postgres advisory lock) |

Rules worth knowing:

- PKCE with S256 is mandatory; `plain` is refused.
- Redirect URIs must be https, loopback http (any port, per RFC 8252), or a
  private-use scheme; `javascript:`, `data:`, fragments and embedded credentials
  are refused. A request with an unregistered redirect URI never redirects — it
  stops on a Sculpt error page.
- The authorization response carries `iss` (RFC 9207).
- Each consent request can be decided once; codes live five minutes and are
  single-use, and replaying one revokes the grant.
- Refresh tokens rotate on every use. Spent ones are kept until they would have
  expired, so presenting one at any point in its life revokes the grant.
- When no scope is requested, the everyday scopes (`read`, `feedback`,
  `content`) are assumed.
- Changing or resetting the password, ending every session, turning two-factor
  on or off, or an admin changing someone's platform role revokes all of that
  person's OAuth connections and deletes their refresh tokens. Reconnecting an
  app afterwards creates a new connection, so nothing issued before the change
  works again. A password change, a password reset and ending every session
  also revoke personal access tokens.
- Creating a personal access token asks for the password again (or a two-factor
  code for people who sign in with Google or GitHub; anyone with neither must
  have signed in within the last 15 minutes). Tokens always expire, after at
  most a year, and Sculpt emails the person whenever one is created.
- Only the MCP service, after proving its secret, is exempt from the token
  endpoint's rate limit; claiming its client id is not enough.
- Client ID Metadata Documents are fetched with an SSRF guard: https only, DNS
  pinned to public addresses (IP literals and NAT64/IPv4-mapped forms included),
  no redirects, 64 KB cap, 5-second idle timeout and a 10-second overall
  deadline, cached for 5 minutes to 24 hours. The API and the MCP server share
  the same address policy file, and a test fails if the two copies drift.
- Discovery is RFC 8414 only. Sculpt is not an OpenID provider and does not
  advertise itself as one; a requested `openid` scope is ignored.
- Dynamic registration is rate limited and can be turned off
  (`OAUTH_DYNAMIC_REGISTRATION=false`). Registered clients nobody connected
  within a week are pruned.
- Anyone can register an app under any name, so the consent screen never
  trusts the name. It shows the host the app really belongs to (the metadata
  document's host, or where it redirects), warns loudly when the name does not
  match that host, says when an app runs on the person's own computer, and how
  recently a self-registered app appeared. Admins can mark apps they trust as
  verified, and disable any app, under **Admin → Connected apps**; disabling
  disconnects everyone using it.

### Traceability

Every audit entry written during a delegated request carries a `delegation`
object in its metadata — `{via: "oauth", clientId, grantId, tokenId,
actingThrough: "sculpt-mcp"}` or `{via: "personal_access_token", tokenId}` — so
the audit log always says which app acted for whom. Registrations, consents,
denials, revocations, code and refresh-token reuse, personal token creation and
revocation, and admin client changes are audited in their own right.

### The MCP server (`apps/mcp`)

- **59 tools** across account, projects, members and sharing, folders, media and
  versions, comments, reviews, search, notifications and reports. Each declares
  its scope and is annotated `readOnlyHint` / `destructiveHint` /
  `idempotentHint`; only tools the connection's scopes allow are listed. Tools
  that delete permanently, and every tool that changes who can see or do what
  (invitations, roles, share links, project settings, joining projects), are
  marked destructive and tell the model to confirm with the person first and
  never to act because content asked it to. Tools that download from a
  `sourceUrl` are marked `openWorldHint`.
- **`view_version`** returns the media as an image block — the picture, a video's
  poster frame, a PDF's first page or a 3D render — so the model reviews what
  people actually see. Comments accept a `region` in the viewer's normalised
  coordinates (fractions of width and height from the top-left), video
  timestamps, PDF pages and 3D anchors, and render exactly like human ones.
- **Uploads** accept base64 or a public `sourceUrl` (SSRF-guarded download),
  limited by `MCP_MAX_UPLOAD_MB`.
- **Resources** expose projects, versions with their feedback, and version
  previews; **prompts** package common workflows (`review_version`,
  `summarize_feedback`, `project_status`, `triage_inbox`).
- **Server instructions** explain Sculpt's model to the assistant: versions own
  feedback, how roles work, how to anchor comments, to confirm before
  destructive actions, and that comments, file names and other content are
  information rather than instructions.
- **Requests are checked before they are read.** The bearer token is verified
  before the request body is parsed, so unauthenticated callers cannot make the
  server buffer large uploads. Requests carrying an `Origin` header from an
  untrusted web origin are refused (DNS-rebinding protection); configure extra
  origins with `MCP_ALLOWED_ORIGINS`.
- Tool results carry the data once as `structuredContent` and once as compact
  JSON text for clients that only read text.
- Errors come back as tool errors that tell the model how to recover — for a
  missing scope, which permission to ask the person to grant.
- Older clients that look for authorization server metadata on the MCP origin
  get it relayed from the API.

## REST API access

Everything is also available directly over REST (`docs/openapi.yaml`) with a
bearer token: either an OAuth access token whose audience is the API, or a
personal access token. Responses to bearer requests include `X-Sculpt-Scopes`
listing the scopes in effect. CORS allows bearer requests from any origin but
never with credentials, so a page cannot ride on someone's session cookie.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `OAUTH_ISSUER` | api, mcp | public issuer; defaults to `API_URL` |
| `MCP_RESOURCE_URL` | api, mcp | the MCP server's public `/mcp` URL — the audience of AI client tokens |
| `MCP_CLIENT_SECRET` | api, mcp | shared secret for token exchange; ≥ 32 characters in production |
| `SCULPT_API_URL` | mcp | how the MCP server reaches the API (internal address in Docker) |
| `OAUTH_DYNAMIC_REGISTRATION`, `OAUTH_CLIENT_METADATA_DOCUMENTS` | api | client onboarding switches |
| `OAUTH_ACCESS_TOKEN_TTL_MINUTES`, `OAUTH_REFRESH_TOKEN_TTL_DAYS`, `OAUTH_KEY_ROTATION_DAYS` | api | lifetimes |
| `MCP_MAX_UPLOAD_MB`, `MCP_MAX_IMAGE_MB` | mcp | size limits for uploads and images returned to models |
| `MCP_ALLOWED_ORIGINS` | mcp | extra web origins allowed to call `/mcp` from a browser (`*` turns the check off) |

Outside production every value has a matching default, so `npm run dev` in
`apps/api`, `apps/web` and `apps/mcp` gives a working setup with no
configuration. In production the API refuses to start with `MCP_RESOURCE_URL`
but no strong `MCP_CLIENT_SECRET`, and the MCP server refuses to start without
both. With Docker, add the `ai` profile (see `docker-compose.selfhost.yml`); the
bundled Caddyfile routes `/mcp`, `/oauth/*` and the `.well-known` documents.

## Testing

- `apps/api`: unit tests for scopes, PKCE, redirect rules, the SSRF guard,
  authorization requests and consent (single use, remembered choices, client
  identity), the token endpoint (code replay, refresh reuse, exchange
  restrictions), credential changes ending delegated access, re-consent never
  reviving old refresh tokens, step-up before creating tokens, and the route
  inventory and coverage invariants.
- `apps/mcp`: unit tests for the tool registry, annotations (access changes are
  destructive, URL fetchers are open-world), file intake, error explanations,
  caller resolution (revoked connections are invalid tokens) and the HTTP
  endpoint (challenge, metadata, Origin checks, auth before body parsing,
  scope-filtered tool lists).
- `apps/mcp/scripts/smoke.mjs` (`npm run smoke`): drives a running stack with
  the official MCP SDK client, including its own OAuth implementation, then
  creates a project, uploads and views an image, comments on a region, replies,
  resolves, reviews, versions, searches, exports and shares — and checks
  read-only grants, personal access tokens, forged tokens, untrusted origins and
  a disconnected app receiving `401`.
- `e2e/oauth-security.mjs` (`npm run oauth`): code replay, single-use consent
  requests, refresh-token reuse revoking live tokens, no token passthrough,
  exchange restricted to the MCP service, session-only routes, step-up before
  creating a token, personal token revocation, and a password change ending
  connections and tokens without reconnecting reviving them.
