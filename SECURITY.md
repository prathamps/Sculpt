# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's [private vulnerability reporting](https://github.com/prathamps/Sculpt/security/advisories/new) (Security → Report a vulnerability). If that is unavailable to you, open a regular issue containing only "security report — please provide a private contact" with no technical detail, and a maintainer will follow up.

Please include:

- what an attacker can do (read another project's media, escalate a role, execute code…)
- the steps or request sequence that reproduces it
- the affected version or commit, and whether you ran with local disk or S3 storage

You will get an acknowledgement within 7 days. Sculpt is a small volunteer project with no paid support or bug bounty, but fixes for confirmed vulnerabilities are prioritised over feature work, and you will be credited in the release notes unless you prefer otherwise.

## Supported versions

Fixes land on `main`, and tagged releases publish container images to GHCR.
There is no long-term support branch — self-hosters should track `main` or the
latest tag.

**Anything before the release that introduced session revocation and
membership-checked media delivery is considered vulnerable.** Those builds
admitted unauthenticated Socket.IO connections, allowed any project room to be
joined, served every upload without authentication, and silently fell back to a
publicly known `JWT_SECRET`. See [CHANGELOG.md](CHANGELOG.md) for the full list.

## What counts as a vulnerability

In scope:

- **Authorization bypass** — reading or mutating a project you are not a member of, or acting above your `ProjectRole` (VIEWER < MEMBER < EDITOR < OWNER). Every endpoint touching project data must check membership *and* role; a missing check is a vulnerability, not a bug.
- **Authentication flaws** — JWT handling, cookie flags, OAuth callback handling, share-link token guessing or privilege escalation via a share link.
- **Stored file serving** — anything that makes an upload execute in a visitor's browser, or that reaches media belonging to a project you are not a member of. Uploads are restricted to inline-safe types, the stored extension is derived from the declared MIME type (never the client filename), and media is served through a membership-checked route with `X-Content-Type-Options: nosniff` and a locked-down CSP. A way around any of those is in scope.
- **Injection** — SQL (via raw Prisma queries), command injection through the ffmpeg pipeline, or CSV formula injection in exported reports.
- **Realtime** — joining a Socket.IO version room without project membership, or reading another project's presence or comment stream.
- **Audit integrity** — suppressing or forging audit entries.

Out of scope:

- Brute force that stays under the built-in limits. Sign-in, registration, password reset and admin sign-in are rate limited per address (shared across instances when Redis is configured); a bypass of those limits *is* in scope.
- Denial of service through large uploads or expensive transcodes. `MAX_UPLOAD_MB` bounds uploads, authorization runs before any bytes are written, staged files are always swept, and transcoding is a bounded queue — but an authenticated EDITOR can still saturate a small host. Deploy with resource limits.
- Anything requiring a compromised `JWT_SECRET`, database credentials, or host access.
- Vulnerabilities in third-party dependencies with no exploitable path through Sculpt (report those upstream; we still welcome a heads-up).

## Deploying safely

- Set a long random `JWT_SECRET` (`openssl rand -base64 48`). With
  `NODE_ENV=production` the API **refuses to start** if it is missing, still the
  placeholder from `.env.example`, or shorter than 32 characters. Outside
  production it falls back to a development default, so never run a public
  instance with `NODE_ENV` unset.
- Set `TRUST_PROXY` only to the real number of proxy hops in front of the app; otherwise `X-Forwarded-For`, and therefore audit-logged IPs, can be spoofed.
- Restrict `FRONTEND_URL` / `API_URL` to hosts you control — CORS drives
  cookie-authenticated access, and `FRONTEND_URL` is required in production.
  Only add `CORS_ALLOWED_HOST_SUFFIXES` if you genuinely need a preview
  platform's subdomains; anything you list there can make credentialed requests
  on behalf of your signed-in users.
- Serve over HTTPS. Auth cookies are only marked `secure` when running in production mode.
- Treat share links as bearer credentials: anyone holding the token gets the role
  it was created with. Prefer setting an expiry and a use cap when you create
  one, and revoke links you no longer need.
- Using S3? Set `S3_PRIVATE=true`. With a public bucket, object URLs bypass
  Sculpt's access checks entirely and stay readable after you remove someone
  from a project.
- Back up the database and the uploads volume together — see
  [docs/backup-and-restore.md](docs/backup-and-restore.md).

## Known dependency advisories

CI audits both apps on every push. It reports every advisory and fails the
build on a **critical** one in the runtime dependency tree, since a
build-time-only advisory never reaches a running server. These runtime
advisories are currently known and accepted, because each needs a major
upgrade that has to be done and tested deliberately:

| Package | Severity | Why it is still here |
| --- | --- | --- |
| `prisma`, `@prisma/config`, `deepmerge-ts`, `effect` | high | Fixed only in Prisma 7, which changes client generation and configuration. Tracked as its own upgrade. |
| `postcss` (via `next`) | high | Fixed only in Next 16. Affects CSS stringification at build time. |

Neither is reachable from untrusted input in the way Sculpt uses them, but both
should be closed out rather than carried indefinitely. Re-check with:

```bash
cd apps/api && npm audit --omit=dev
cd apps/web && npm audit --omit=dev
```
