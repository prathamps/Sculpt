# Sculpt MCP server

Lets AI assistants — Claude, ChatGPT, Cursor, VS Code, Claude Code and any other
[Model Context Protocol](https://modelcontextprotocol.io) client — work in Sculpt
on a person's behalf: look at media, leave anchored comments, upload versions,
approve work, organise folders, manage members and sharing.

It is a **stateless resource server**. It stores nothing; every tool call is a
request to the Sculpt REST API, so the API's role checks, audit log,
notifications and realtime updates apply exactly as they do in the browser.
See [docs/ai-integration.md](../../docs/ai-integration.md) for the full design.

## Run it

```bash
cp .env.example .env     # defaults work against a local API on :3001
npm install
npm run dev              # http://localhost:3002/mcp
```

The API must know the same values: `MCP_RESOURCE_URL` (this server's public
`/mcp` URL) and `MCP_CLIENT_SECRET`. Outside production both have matching
development defaults, so a local API and MCP server work together with no
configuration.

Browser-based clients are accepted only from the web app's origin, this
server's own origin and, outside production, loopback origins such as the MCP
Inspector. Add others to `MCP_ALLOWED_ORIGINS`.

Then connect a client to `http://localhost:3002/mcp`, for example:

```bash
claude mcp add --transport http sculpt http://localhost:3002/mcp
```

The client discovers Sculpt's authorization server, registers itself, and opens
the browser for you to sign in and approve access.

### Local stdio mode

For clients that launch MCP servers as a local process, build once and run
`dist/stdio.js` with a personal access token:

```json
{
  "mcpServers": {
    "sculpt": {
      "command": "node",
      "args": ["/path/to/Sculpt/apps/mcp/dist/stdio.js"],
      "env": {
        "SCULPT_API_URL": "https://sculpt.example.com/api-origin",
        "SCULPT_ACCESS_TOKEN": "sculpt_pat_…"
      }
    }
  }
}
```

## What it exposes

- **59 tools** covering accounts, projects, members, invitations, share links,
  folders, media, versions, uploads, comments (with drawn regions, video
  timestamps, PDF pages and 3D anchors), attachments, reviews, due dates,
  search, notifications and reports. Each tool is annotated read-only,
  destructive or idempotent, and only the tools the connection's scopes allow
  are listed.
- **`view_version`** returns the media as an image so the model can actually
  see what it is reviewing.
- **Resources**: `sculpt://projects`, `sculpt://projects/{projectId}`,
  `sculpt://versions/{versionId}`, `sculpt://versions/{versionId}/preview`.
- **Prompts**: `review_version`, `summarize_feedback`, `project_status`,
  `triage_inbox`.

## Commands

```bash
npm run build     # typecheck + compile to dist/
npm test          # vitest
npm run smoke     # full OAuth + tool walkthrough against running API and MCP servers
```

`npm run smoke` drives the server with the official MCP SDK client, including
its OAuth implementation: discovery, dynamic registration, PKCE, consent and
token exchange. Point it elsewhere with `SCULPT_API_URL`, `MCP_RESOURCE_URL`
and `FRONTEND_URL`.
