# Deployment

Sculpt ships three supported paths. All of them run the same code; pick by how much infrastructure you want to manage.

## 1. Single-host Docker Compose (simplest)

Runs Postgres, Redis, the API and the web UI on one machine:

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose -f docker-compose.selfhost.yml up -d --build
```

- Web UI: `http://localhost:3000`, API: `http://localhost:3001`
- Database migrations run automatically when the API container starts
- Uploads persist in the `sculpt_uploads` volume; the database in `sculpt_pgdata`

For a public deployment set `FRONTEND_URL` and `API_URL` to your real origins (e.g. behind a reverse proxy such as Caddy or nginx with TLS) and pass a strong `POSTGRES_PASSWORD`:

```bash
JWT_SECRET=... POSTGRES_PASSWORD=... \
FRONTEND_URL=https://sculpt.example.com API_URL=https://api.sculpt.example.com \
docker compose -f docker-compose.selfhost.yml up -d --build
```

Because `NEXT_PUBLIC_*` values are baked into the web bundle at build time, rebuild the `web` image after changing `API_URL`.

## 2. Managed platforms (Railway + Vercel)

The setup this repository's CI is designed around:

- **API on Railway** — `apps/api/railway.toml` configures the build (`npm install && npx prisma generate && npm run build`) and start (`npx prisma migrate deploy && npm start`). Add a Postgres and Redis service, then set the env vars below.
- **Web on Vercel** — import the repo, set the root directory to `apps/web`, and set `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` to the Railway API URL.
- **Database** — Railway Postgres or a hosted Postgres like Supabase/Neon. With a connection pooler, point `DATABASE_URL` at the pooled port and `DIRECT_URL` at the direct one (Prisma migrations need the direct connection).

Deploys are git-driven: pushes to `main` release automatically after CI passes.

> **Important:** platforms with ephemeral filesystems (Railway included) lose local uploads on redeploy. Configure S3 storage (below) for anything beyond a demo.

## 3. Your own infrastructure

Build both apps (`npm run build`) and run `node dist/index.js` (API, after `npx prisma migrate deploy`) and `next start` or the standalone server (web) under your process manager. The provided Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`) are production-ready if you prefer images.

## Environment variables

### API (`apps/api/.env.example` has the full annotated list)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | ✅ | Postgres connection (pooled / direct) |
| `JWT_SECRET` | ✅ | signing key for auth cookies — use a long random value |
| `FRONTEND_URL`, `API_URL` | ✅ in prod | CORS + OAuth redirect construction |
| `REDIS_URL` | optional (required for >1 instance) | Socket.IO fan-out, cross-instance presence, shared rate limits |
| `CORS_ALLOWED_HOST_SUFFIXES` | optional | apex domains whose subdomains may call the API (e.g. preview deploys) |
| `LOG_LEVEL` | optional | `debug`/`info`/`warn`/`error`; JSON lines in production |
| `TRUST_PROXY` | behind a proxy | number of trusted proxy hops so `req.ip` and audit IPs use `X-Forwarded-For` (leave unset when direct-facing) |
| `GOOGLE_*`, `GITHUB_*` | optional | OAuth login buttons appear only when set |
| `SMTP_*` | optional | email notifications for offline members |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_URL` | optional | switch file storage to any S3-compatible store |
| `S3_PRIVATE` | optional | keep the bucket private and serve presigned redirects |
| `MAX_UPLOAD_MB` | optional | upload size limit (default 2048) |
| `VIDEO_WORKER_CONCURRENCY`, `IMAGE_WORKER_CONCURRENCY` | optional | parallel ffmpeg jobs per instance |
| `SCULPT_INSTANCE_ID` | multi-instance | stable id so crash recovery only reclaims this instance's transcodes |

### Web

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | ✅ | API origin (baked at build time) |
| `NEXT_PUBLIC_SOCKET_URL` | ✅ | Socket.IO origin (usually the same) |

## S3-compatible storage

Set `S3_BUCKET` (plus credentials via the standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) and the API stores media in object storage instead of local disk:

- **AWS S3** — set `S3_BUCKET` and `S3_REGION`; public URL defaults to the bucket's virtual-hosted style URL
- **Cloudflare R2 / MinIO** — additionally set `S3_ENDPOINT` (path-style addressing is used automatically)
- **CDN in front** — set `S3_PUBLIC_URL` to the CDN origin

Set `S3_PRIVATE=true` to keep the bucket private. Media then resolves through
the API's authenticated route, which checks project membership and redirects to
a short-lived presigned URL. Leave it off only if you accept that anyone holding
an object URL can read your clients' media — including people you later removed
from the project.

## Operations notes

- **Migrations** — always `npx prisma migrate deploy` on release (both the Docker CMD and railway.toml already do this)
- **Health check** — `GET /health` reports per-component status and returns
  `503` when the database is unreachable, so load balancers drain the instance:
  `{"status":"ok","components":{"database":"ok","redis":"ok"}}`
- **Backups** — see [backup-and-restore.md](backup-and-restore.md). Both the
  database and the uploads volume must be captured together.
- **Audit trail** — security-relevant actions land in the `AuditLog` table and
  are visible at `/admin/audit`. IP addresses are retained indefinitely by
  default; the backup guide includes a pruning query.
- **Admin bootstrap** — register through the UI, then promote that account. This
  works inside the production image, which ships only compiled output:

  ```bash
  docker compose -f docker-compose.selfhost.yml exec api     npm run promote-admin -- you@example.com
  ```

- **Logs** — production logs are one JSON object per line (`level`, `message`,
  `time`, plus context). Pipe them into whatever you already run.
- **Scaling out** — set `REDIS_URL` and a distinct `SCULPT_INSTANCE_ID` per
  replica. Without Redis, realtime events stay local to the instance that
  emitted them and only half your users see new comments.
