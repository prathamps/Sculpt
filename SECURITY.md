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

Fixes land on `main`. There is no long-term support branch — self-hosters should track `main` or a tagged release.

## What counts as a vulnerability

In scope:

- **Authorization bypass** — reading or mutating a project you are not a member of, or acting above your `ProjectRole` (VIEWER < MEMBER < EDITOR < OWNER). Every endpoint touching project data must check membership *and* role; a missing check is a vulnerability, not a bug.
- **Authentication flaws** — JWT handling, cookie flags, OAuth callback handling, share-link token guessing or privilege escalation via a share link.
- **Stored file serving** — anything that makes an upload execute in a visitor's browser. Uploads are restricted to inline-safe types, the stored extension is derived from the declared MIME type (never the client filename), and `/uploads` is served with `X-Content-Type-Options: nosniff` and a locked-down CSP. A way around any of those is in scope.
- **Injection** — SQL (via raw Prisma queries), command injection through the ffmpeg pipeline, or CSV formula injection in exported reports.
- **Realtime** — joining a Socket.IO version room without project membership, or reading another project's presence or comment stream.
- **Audit integrity** — suppressing or forging audit entries.

Out of scope:

- Missing rate limiting on unauthenticated endpoints (known gap; a reverse proxy is the expected mitigation for self-hosters).
- Denial of service through large uploads or expensive transcodes. `MAX_UPLOAD_MB` bounds uploads and transcoding is queued, but an authenticated EDITOR can still saturate a small host — deploy with resource limits.
- Anything requiring a compromised `JWT_SECRET`, database credentials, or host access.
- Vulnerabilities in third-party dependencies with no exploitable path through Sculpt (report those upstream; we still welcome a heads-up).

## Deploying safely

- Set a long random `JWT_SECRET`. The code falls back to a development default if it is unset — never run a public instance without it.
- Set `TRUST_PROXY` only to the real number of proxy hops in front of the app; otherwise `X-Forwarded-For`, and therefore audit-logged IPs, can be spoofed.
- Restrict `FRONTEND_URL` / allowed origins to hosts you control — CORS drives cookie-authenticated access.
- Serve over HTTPS. Auth cookies are only marked `secure` when running in production mode.
- Treat share links as bearer credentials: anyone holding the token gets the role it was created with.
