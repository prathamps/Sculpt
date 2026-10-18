# Sculpt

Sculpt is an open-source, real-time visual collaboration platform inspired by frame.io. Teams annotate images, videos, PDFs and 3D models, discuss them with location-anchored comment threads, approve or request changes, track versions as designs evolve, and see each other's activity live. Every feature is free — there are no paid tiers.

**What makes it different:** most review tools stop at images and video. Sculpt
reviews **3D models** the same way — orbit a model, drop a pin on its surface,
and every reviewer who opens that comment gets the camera flown back to the exact
saved viewpoint. Sixteen model formats are converted to GLB in the browser
before upload. If your team reviews product renders, game assets, architectural
viz or printable parts alongside ordinary media, that is the gap this fills.

![Annotating an image and commenting in Sculpt](docs/media/image-annotation.gif)

![Placing a pin on a 3D model and flying back to its saved view](docs/media/model-annotation.gif)

> Every capture above and in the **[full showcase](docs/showcase.md)** — image,
> video, PDF and 3D annotation — was recorded from a real Sculpt instance
> driven end to end in a browser.

**Every revision, verified.** When a new version arrives, every open piece of
feedback from earlier versions follows it as a **revision check**: one tap jumps
to the exact spot, frame, page or 3D view with the original drawing overlaid,
and reviewers mark it *fixed* (which resolves the original thread) or *still
open* (which carries it to the next version). And **what changed** is shown, not
guessed: swipe, onion-skin and difference views with changed areas outlined for
images, and a geometric deviation heatmap between two versions of a 3D model —
the kind of check usually found only in CAD inspection software.

**AI-first.** Connect Claude, ChatGPT, Cursor, VS Code or any MCP client and it
can do everything you can: look at a version, pin feedback to the exact region
or video frame, upload the revision, approve it, organise the project and manage
who has access. You approve each connection with OAuth, choose what it may do,
and disconnect it whenever you like; every action it takes is audited as done
through that app. See [docs/ai-integration.md](docs/ai-integration.md).

## Features

- **Annotation tools** — pencil, rectangle and line drawing with color options and undo/redo
- **Location-aware comments** — threaded discussions tied to exact coordinates, with likes and resolution tracking
- **Video annotation** — frame-accurate stepping and SMPTE timecode (drop-frame aware, starting from the camera's own timecode), timestamp-anchored comments and drawings, and the current annotated frame as PNG. Uploads are transcoded in the background to a constant-frame-rate 1080p rendition with a keyframe every second so scrubbing stays smooth, plus a 540p data-saver rendition that phones and slow connections pick automatically
- **Editor hand-off** — export a video's comments as timeline markers for DaVinci Resolve (EDL) or Premiere Pro / Final Cut Pro 7 (XML), so feedback lands on the editor's timeline at the right frame
- **3D model review** — orbit a model and drop numbered pins directly on its surface; selecting a comment flies the camera back to the exact saved view. Section cuts, point-to-point measurement, front/top/side views, clay, wireframe and normals shading, studio lighting, a model-details panel (triangles, materials, textures, size), animation playback, PNG view export, and linked cameras when comparing two versions. GLB, glTF, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF, WRL, KMZ, VOX, PCD, XYZ and GCODE are accepted (converted to GLB in the browser on upload, with a rendered thumbnail), including Draco-, KTX2- and meshopt-compressed glTF
- **Wide format support** — anything you upload becomes reviewable. Video in containers a browser cannot play (MKV, AVI, WMV, FLV, MPEG, TS, 3GP, MXF, DV, ProRes) is transcoded on the server; images a browser cannot show (TIFF, PSD, TGA, EXR, DPX, JPEG 2000, PCX) get a PNG rendition. The original file is always kept
- **PDF review** — page-by-page viewing with comments and drawings anchored to the page they were made on
- **Review & approval** — reviewers approve or request changes per version with
  optional notes and due dates; a single "changes requested" outweighs any number
  of approvals, and status is live, audited and summarised per project
- **Version control** — upload new versions of a file while preserving its feedback history
- **Revision check** — open feedback from earlier versions carries forward as a checklist on each new version; confirm each item fixed or still open, see the original drawing in place, and get warned before approving with items unchecked
- **Visual version diff** — swipe, onion skin and pixel difference with changed areas outlined for images; a deviation heatmap with an adjustable tolerance and point measurements for 3D models; frame-locked synced playback when comparing two video versions
- **Resumable uploads** — large files go up in chunks that survive dropped connections, flaky mobile networks and page reloads
- **Real-time collaboration** — Socket.IO keeps annotations, comments and notifications live across the team
- **Works on phones** — the viewer, player and composer adapt to small screens: a full-width scrubber, touch-sized controls, tap to play, a draw toggle so scrubbing and drawing never fight, and fullscreen that works on iOS
- **Search** — find any project, file or comment you have access to (`Ctrl`/`Cmd`+`K`)
- **Projects & permissions** — role-based membership (owner, editor, member,
  viewer), editable at any time; invite people by email even before they have an
  account; tokenized share links for external stakeholders, with optional expiry
  and use limits
- **Exports & reports** — annotated PNGs plus JSON/CSV/printable reports of every version, comment and resolution
- **Notifications** — in-app, with email delivery for members who are offline (any SMTP provider)
- **AI assistants (MCP)** — a built-in Model Context Protocol server with 59 tools, resources and review prompts; assistants connect with OAuth 2.1 (dynamic registration, PKCE, consent, scoped and revocable tokens), and scripts use personal access tokens
- **OAuth login** — Google and GitHub buttons appear automatically when configured, alongside email/password
- **Admin panel** — user/project management, usage stats and a full **audit log** of security-relevant actions
- **Pluggable storage** — local disk by default, or any S3-compatible object store (AWS S3, Cloudflare R2, MinIO). Media is served through a membership-checked route, so removing someone actually revokes their access to the files
- **Account control** — self-service password reset, data export and account
  deletion; email notifications are opt-out

## Tech stack

| Layer     | Technology                                          |
| --------- | --------------------------------------------------- |
| Frontend  | Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui |
| Backend   | Node.js, Express 5, TypeScript                       |
| Database  | PostgreSQL with Prisma ORM                           |
| Real-time | Socket.IO (Redis adapter, presence and viewer state for multi-instance) |
| Auth      | JWT cookies, Passport (Google / GitHub OAuth); OAuth 2.1 authorization server for AI clients |
| AI        | MCP server (official TypeScript SDK, Streamable HTTP + stdio) |
| Storage   | Local disk or S3-compatible object storage           |

## Quick start (self-hosted)

The fastest way to run the whole platform:

```bash
git clone https://github.com/prathamps/sculpt.git
cd sculpt
POSTGRES_PASSWORD=$(openssl rand -base64 32) \
JWT_SECRET=$(openssl rand -base64 48) \
docker compose -f docker-compose.selfhost.yml up -d --build
```

Open http://localhost:3000, register, then promote yourself to administrator:

```bash
docker compose -f docker-compose.selfhost.yml exec api \
  npm run promote-admin -- you@example.com
```

**Running it on a real domain?** Add the bundled Caddy profile and you get HTTPS
with automatic certificates:

```bash
SCULPT_DOMAIN=sculpt.example.com TLS_EMAIL=you@example.com \
FRONTEND_URL=https://sculpt.example.com \
API_URL=https://sculpt.example.com/api-origin \
POSTGRES_PASSWORD=$(openssl rand -base64 32) \
JWT_SECRET=$(openssl rand -base64 48) \
TRUST_PROXY=1 \
docker compose -f docker-compose.selfhost.yml --profile tls up -d --build
```

In production the API refuses to start with a weak or missing `JWT_SECRET` —
that is deliberate. See [docs/deployment.md](docs/deployment.md) for hosting
options (Railway + Vercel, S3 storage, OAuth, SMTP) and
[docs/backup-and-restore.md](docs/backup-and-restore.md) before you put real
work in it.

## Local development

Prerequisites: Node.js 20+, Docker (for Postgres + Redis).

```bash
# 1. Start the infrastructure
docker compose up -d

# 2. Configure environment
cp apps/api/.env.example apps/api/.env          # fill in JWT_SECRET at minimum
cp apps/web/.env.example apps/web/.env.local

# 3. Install and migrate
cd apps/api && npm install && npx prisma migrate dev
cd ../web && npm install
cd ../mcp && npm install

# 4. Run the apps (in separate terminals)
cd apps/api && npm run dev    # http://localhost:3001
cd apps/web && npm run dev    # http://localhost:3000
cd apps/mcp && npm run dev    # http://localhost:3002/mcp  (optional: AI assistants)
```

Run the API test suite with `npm test` in `apps/api`.

Every integration is optional and degrades gracefully: without OAuth keys the buttons don't render, without SMTP emails are skipped, without Redis presence falls back to in-memory, and without S3 files are stored on disk.

## Repository layout

```
sculpt/
├── apps/
│   ├── api/                  # Express + Prisma backend
│   │   └── src/
│   │       ├── modules/      # feature modules (auth, projects, media, comments, …)
│   │       ├── storage/      # storage port + local/S3 adapters
│   │       ├── realtime/     # Socket.IO server
│   │       ├── middleware/   # auth + upload middleware
│   │       └── lib/          # prisma, redis, presence, errors
│   ├── web/                  # Next.js frontend
│   └── mcp/                  # MCP server for AI assistants
├── docs/                     # architecture & deployment guides
├── docker-compose.yml        # dev infrastructure (Postgres + Redis)
└── docker-compose.selfhost.yml  # full self-hosted stack
```

More detail in [docs/architecture.md](docs/architecture.md).

## Documentation

| Document | What's in it |
| --- | --- |
| [docs/showcase.md](docs/showcase.md) | screenshots and recordings of image, video, PDF and 3D review in action |
| [docs/architecture.md](docs/architecture.md) | how the codebase fits together, and why |
| [docs/ai-integration.md](docs/ai-integration.md) | connecting AI assistants: MCP server, OAuth 2.1, scopes, tokens |
| [docs/deployment.md](docs/deployment.md) | hosting, environment variables, TLS, scaling out |
| [docs/backup-and-restore.md](docs/backup-and-restore.md) | what to back up, how to restore, how to verify |
| [docs/openapi.yaml](docs/openapi.yaml) | full REST API reference (OpenAPI 3.1) |
| [CHANGELOG.md](CHANGELOG.md) | what changed, including security fixes worth upgrading for |
| [SECURITY.md](SECURITY.md) | threat model, what counts as a vulnerability, how to report one |

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first areas: new annotation tools, performance, UI/UX polish, documentation and tests.

## License

[MIT](LICENSE)
