# Sculpt

Sculpt is an open-source, real-time visual collaboration platform inspired by frame.io. Teams annotate images and videos, discuss them with location-anchored comment threads, track versions as designs evolve, and see each other's activity live. Every feature is free — there are no paid tiers.

## Features

- **Annotation tools** — pencil, rectangle and line drawing with color options and undo/redo
- **Location-aware comments** — threaded discussions tied to exact coordinates, with likes and resolution tracking
- **Video annotation** — frame-by-frame playback with timestamp-anchored comments and drawings; export the current annotated frame as PNG
- **Version control** — upload new versions of a file while preserving its feedback history
- **Real-time collaboration** — Socket.IO keeps annotations, comments and notifications live across the team
- **Projects & permissions** — role-based membership (owner, editor, member, viewer) and tokenized share links for external stakeholders
- **Exports & reports** — annotated PNGs plus JSON/CSV/printable reports of every version, comment and resolution
- **Notifications** — in-app, with email delivery for members who are offline (any SMTP provider)
- **OAuth login** — Google and GitHub buttons appear automatically when configured, alongside email/password
- **Admin panel** — user/project management, usage stats and a full **audit log** of security-relevant actions
- **Pluggable storage** — local disk by default, or any S3-compatible object store (AWS S3, Cloudflare R2, MinIO)

## Tech stack

| Layer     | Technology                                          |
| --------- | --------------------------------------------------- |
| Frontend  | Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui |
| Backend   | Node.js, Express 5, TypeScript                       |
| Database  | PostgreSQL with Prisma ORM                           |
| Real-time | Socket.IO (Redis-backed presence)                    |
| Auth      | JWT cookies, Passport (Google / GitHub OAuth)        |
| Storage   | Local disk or S3-compatible object storage           |

## Quick start (self-hosted)

The fastest way to run the whole platform:

```bash
git clone https://github.com/prathamps/sculpt.git
cd sculpt
JWT_SECRET=$(openssl rand -hex 32) docker compose -f docker-compose.selfhost.yml up -d --build
```

Open http://localhost:3000. See [docs/deployment.md](docs/deployment.md) for production hosting options (Railway + Vercel, S3 storage, OAuth and SMTP setup).

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

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first areas: new annotation tools, performance, UI/UX polish, documentation and tests.

## License

[MIT](LICENSE)
