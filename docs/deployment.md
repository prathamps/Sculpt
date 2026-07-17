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
| `REDIS_URL` | optional | presence mirroring; falls back to in-memory |
| `GOOGLE_*`, `GITHUB_*` | optional | OAuth login buttons appear only when set |
| `SMTP_*` | optional | email notifications for offline members |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_URL` | optional | switch file storage to any S3-compatible store |
| `MAX_UPLOAD_MB` | optional | upload size limit (default 200) |

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

The bucket (or CDN) must serve objects publicly, since media URLs are embedded directly in the UI.

## Operations notes

- **Migrations** — always `npx prisma migrate deploy` on release (both the Docker CMD and railway.toml already do this)
- **Health check** — `GET /health` on the API returns `{"status":"ok"}`
- **Audit trail** — security-relevant actions land in the `AuditLog` table and are visible at `/admin/audit`; export/retention policy is up to your compliance needs
- **Admin bootstrap** — promote the first admin with `npx ts-node src/scripts/promote-admin.ts <email>` (or set `role = 'ADMIN'` directly in the database)
