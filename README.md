# Sculpt

Sculpt is an open-source, real-time visual collaboration platform inspired by frame.io. Teams annotate images, videos, PDFs and 3D models, discuss them with location-anchored comment threads, approve or request changes, track versions as designs evolve, and see each other's activity live. Every feature is free — there are no paid tiers.

**What makes it different:** most review tools stop at images and video. Sculpt
reviews **3D models** the same way — orbit a model, drop a pin on its surface,
and every reviewer who opens that comment gets the camera flown back to the exact
saved viewpoint. Sixteen model formats are converted to GLB in the browser
before upload. If your team reviews product renders, game assets, architectural
viz or printable parts alongside ordinary media, that is the gap this fills.

![Sculpt review workspace](apps/web/public/herobanner.jpg)

> Screenshots above show the review workspace. Replace the images in
> `apps/web/public/` with captures from your own instance if you fork this.

## Features

- **Annotation tools** — pencil, rectangle and line drawing with color options and undo/redo
- **Location-aware comments** — threaded discussions tied to exact coordinates, with likes and resolution tracking
- **Video annotation** — frame-by-frame playback with timestamp-anchored comments and drawings; export the current annotated frame as PNG. Uploads are transcoded in the background to a web-friendly 1080p rendition so scrubbing stays smooth
- **3D model review** — orbit a model and drop numbered pins directly on its surface; selecting a comment flies the camera back to the exact saved view. GLB, glTF, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF, WRL, KMZ, VOX, PCD, XYZ and GCODE are accepted (converted to GLB in the browser on upload, with a rendered thumbnail), including Draco-, KTX2- and meshopt-compressed glTF
- **Wide format support** — anything you upload becomes reviewable. Video in containers a browser cannot play (MKV, AVI, WMV, FLV, MPEG, TS, 3GP, MXF, DV, ProRes) is transcoded on the server; images a browser cannot show (TIFF, PSD, TGA, EXR, DPX, JPEG 2000, PCX) get a PNG rendition. The original file is always kept
- **PDF review** — page-by-page viewing with comments and drawings anchored to the page they were made on
- **Review & approval** — reviewers approve or request changes per version with
  optional notes and due dates; a single "changes requested" outweighs any number
  of approvals, and status is live, audited and summarised per project
- **Version control** — upload new versions of a file while preserving its feedback history
- **Real-time collaboration** — Socket.IO keeps annotations, comments and notifications live across the team
- **Search** — find any project, file or comment you have access to (`Ctrl`/`Cmd`+`K`)
- **Projects & permissions** — role-based membership (owner, editor, member,
  viewer), editable at any time; invite people by email even before they have an
  account; tokenized share links for external stakeholders, with optional expiry
  and use limits
- **Exports & reports** — annotated PNGs plus JSON/CSV/printable reports of every version, comment and resolution
- **Notifications** — in-app, with email delivery for members who are offline (any SMTP provider)
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
| Real-time | Socket.IO (Redis adapter + presence for multi-instance) |
| Auth      | JWT cookies, Passport (Google / GitHub OAuth)        |
| Storage   | Local disk or S3-compatible object storage           |

## Quick start (self-hosted)

The fastest way to run the whole platform:

```bash
git clone https://github.com/prathamps/sculpt.git
cd sculpt
JWT_SECRET=$(openssl rand -base64 48) docker compose -f docker-compose.selfhost.yml up -d --build
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
JWT_SECRET=$(openssl rand -base64 48) \
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

# 4. Run both apps (in two terminals)
cd apps/api && npm run dev    # http://localhost:3001
cd apps/web && npm run dev    # http://localhost:3000
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
│   └── web/                  # Next.js frontend
├── docs/                     # architecture & deployment guides
├── docker-compose.yml        # dev infrastructure (Postgres + Redis)
└── docker-compose.selfhost.yml  # full self-hosted stack
```

More detail in [docs/architecture.md](docs/architecture.md).

## Documentation

| Document | What's in it |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | how the codebase fits together, and why |
| [docs/deployment.md](docs/deployment.md) | hosting, environment variables, TLS, scaling out |
| [docs/backup-and-restore.md](docs/backup-and-restore.md) | what to back up, how to restore, how to verify |
| [docs/openapi.yaml](docs/openapi.yaml) | full REST API reference (OpenAPI 3.1) |
| [CHANGELOG.md](CHANGELOG.md) | what changed, including security fixes worth upgrading for |
| [SECURITY.md](SECURITY.md) | threat model, what counts as a vulnerability, how to report one |

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first areas: new annotation tools, performance, UI/UX polish, documentation and tests.

## License

[MIT](LICENSE)
