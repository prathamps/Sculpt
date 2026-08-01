# Changelog

All notable changes to Sculpt are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

**These fixes close vulnerabilities present in every earlier build. Upgrade
before exposing an instance to the internet.**

- **Socket.IO connections now require a valid session.** Unauthenticated sockets
  were previously admitted, and the `join` handler fell back to a
  client-supplied user id — letting anyone subscribe to another user's private
  notification stream. Identity now comes from the verified session only.
- **`joinProject` is authorized.** Project rooms broadcast comment activity and
  had no membership check at all; any id could be joined.
- **`JWT_SECRET` is validated at boot.** With `NODE_ENV=production` the server
  refuses to start when the secret is missing, still the documented
  placeholder, or shorter than 32 characters. It previously fell back silently
  to `"your_jwt_secret"` in five places, which let anyone forge any session.
- **CORS no longer trusts all `*.vercel.app` origins.** Preview domains must be
  opted into explicitly via `CORS_ALLOWED_HOST_SUFFIXES`, matched at a dot
  boundary. `localhost` is no longer trusted in production.
- **Uploaded media is access-controlled.** `/uploads` was served by
  `express.static` with no authentication, so every file was readable by URL
  and revoking access revoked nothing. Media now resolves through a
  membership-checked route; set `S3_PRIVATE=true` to get presigned redirects
  instead of a public bucket.
- **Authorization runs before uploads are written.** Role checks happened after
  multer had already streamed up to 2 GB per file to disk and never cleaned up
  on a 403, which allowed any authenticated user to fill the disk. Requests are
  now authorized first, staged files are always swept when the response ends,
  and a reaper clears crash orphans.
- **Rate limiting** on sign-in, registration, password reset and admin sign-in,
  shared across instances when Redis is configured.
- **Sessions can be revoked.** Tokens carry a type, a version and a unique id;
  logout revokes that session, and changing or resetting a password invalidates
  every other session. Admin tokens are no longer interchangeable with ordinary
  user tokens.
- **Share links can expire and be capped**, are revocable, and never demote an
  existing member — previously an owner who followed their own viewer link
  locked themselves out of a project with no way back.
- **Notification emails escape HTML**, closing an injection path through
  display names.
- **CSV exports neutralise spreadsheet formulas** (`=`, `+`, `-`, `@`, tab, CR).
- **Internal errors no longer leak.** Prisma error objects (with table and
  column names) were being returned to clients on ~20 endpoints.
- Filenames use a CSPRNG rather than `Math.random()`.
- Removed a debug notification endpoint that sat outside the auth perimeter.
- Logout is now audited, alongside role changes, sharing and destructive
  actions.

### Added

- **Review and approval workflow.** Reviewers approve or request changes per
  version, with optional notes and due dates. A single "changes requested"
  outweighs any number of approvals. Status is shown in the viewer, broadcast
  over realtime, audited and summarised per project.
- **Search** across projects, media and comments, scoped to what the caller can
  actually see. Opens with `Ctrl`/`Cmd`+`K`.
- **Password reset** by email, with single-use, one-hour, hashed-at-rest tokens.
  The dead "Forgot password?" link now works.
- **Invitations for people who haven't signed up yet.** Previously you could
  only invite existing accounts. Invitations are tokenised, expire after seven
  days, and can be listed and revoked.
- **Member role management** — an endpoint and UI to change a member's role,
  which the app never had, while refusing to remove a project's last owner.
- **Account deletion and data export**, plus an email-notification preference.
- Comment editing, which existed in the service layer but had no route.
- A DB- and Redis-aware `/health` endpoint that reports component status.
- Structured JSON logging with `LOG_LEVEL`, replacing `console.log` calls that
  wrote user ids and comment text to stdout on every notification.
- Caddy TLS profile in the self-host compose file, and
  [backup and restore documentation](docs/backup-and-restore.md).

### Changed

- **Restored the seven foreign-key indexes** dropped by a migration in July
  2025 and never recreated, plus new indexes on `Notification`,
  `ProjectMember`, `ShareLink` and review lookups. Every project page load and
  comment fetch was performing a sequential scan.
- **Multi-instance support.** Socket.IO uses the Redis adapter, presence is
  Redis-backed so offline-email fallback works across replicas, and transcode
  crash recovery only reclaims jobs the current instance owns instead of
  cancelling other replicas' work.
- Video and image rendition queues share one implementation with configurable
  concurrency instead of two near-identical copies.
- Uploads, likes and version creation run in transactions; version numbers are
  uniquely constrained and retry on a race instead of silently duplicating.
- List endpoints paginate (projects, media, comments, notifications, admin
  users and projects) instead of returning entire tables, and
  `getProjectById` no longer loads every version of every file to render
  thumbnails.
- Admin dashboard trends group by day via `date_trunc`; they previously grouped
  by exact timestamp, so every chart bucket held exactly one row.
- Notifications are read from PostgreSQL. The Redis path returned a hash that
  had no TTL and was never invalidated, so anything written while Redis blipped
  stayed invisible forever.
- Services throw typed `AppError`s and controllers map them centrally; a
  transient database failure used to surface as `403`.
- Request bodies and query strings are validated with zod, including a single
  shared password policy — registration previously accepted a one-character
  password that could never be changed to anything equally weak.
- Video comments use the real frame rate probed by ffprobe. Frame stepping
  assumed 30 fps for every file.
- Avatars render locally instead of sending names and emails to
  `api.dicebear.com`, which broke the self-hosted and air-gapped story.

### Fixed

- **Realtime no longer dies after a network blip.** On reconnect the client
  rejoined user and project rooms but never the open version room, so comments,
  presence and processing updates stopped arriving until you switched versions.
  It now rejoins and refetches what it missed.
- Likes from other people appear immediately; the comment card copied like
  state into local state at mount and ignored every later update.
- Annotation canvases track their container with a `ResizeObserver` and scale to
  `devicePixelRatio`, so toggling the sidebar no longer misaligns drawings and
  strokes are sharp on retina displays.
- Touch-drawn rectangles and lines keep their real end point instead of
  snapping to the top-left corner.
- Deleting a file asks for confirmation and says what will be destroyed.
- Failed actions surface a toast instead of only a console message, and a failed
  project fetch shows an error with a retry rather than an empty state.
- Upload progress reports real bytes transferred, and the dropzone that
  advertises drag-and-drop now accepts dropped files.
- Undo takes one press again; the annotation history reducer mutated state from
  inside another updater.
- Export reports count annotations correctly — they read a column nothing ever
  wrote and always reported zero.
- Deleting an account is possible at all: user rows were blocked by foreign keys
  from memberships and comments.

### Removed

- The unused `Message` model and `ImageVersion.annotations` column.
- Unused Redis wrappers and the `getOnlineUserIds` helper.

## [1.0.0] — 2026-07-17

First open-source release: projects, media versions, anchored threaded
comments, drawn annotations, realtime collaboration, share links, admin panel,
audit logging and pluggable storage. Billing was removed and the project
relicensed under MIT.
