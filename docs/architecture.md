# Architecture

Sculpt is a monorepo: an Express API (`apps/api`), a Next.js frontend (`apps/web`) and an MCP server for AI assistants (`apps/mcp`). The API owns all business logic and data; the frontend and the MCP server are both clients of its REST API.

## Backend

The API is a **modular monolith**. Code is organized by feature, not by technical layer — each module owns its routes, controller and service:

```
apps/api/src/
├── modules/
│   ├── auth/            # register/login/logout, OAuth, sessions, password reset, account
│   ├── projects/        # projects, membership, roles, share links, invitations
│   ├── media/           # images/videos/PDFs/3D models, versions, uploads, pipelines
│   ├── comments/        # threaded comments, likes, resolution
│   ├── reviews/         # approval workflow (decisions, status, due dates)
│   ├── search/          # cross-entity search scoped to the caller's projects
│   ├── notifications/   # in-app notifications + email fallback for offline users
│   ├── export/          # JSON/CSV report generation
│   ├── admin/           # admin auth, user/project management, stats
│   ├── health/          # dependency-aware health probe
│   ├── oauth/           # OAuth 2.1 authorization server, bearer auth, personal access tokens
│   └── audit/           # audit log write + query service
├── storage/             # StoragePort + LocalStorage / S3Storage adapters
├── realtime/            # Socket.IO server (rooms, presence hooks)
├── middleware/          # auth guards, role authorization, validation, rate limits, uploads
├── lib/                 # prisma, redis, presence, config, tokens, cookies, logger, errors
├── app.ts               # express app wiring (routes, CORS, static uploads)
└── index.ts             # entrypoint: http server + realtime attach
```

Within a module the flow is `*.routes.ts` (paths + auth, authorization and
validation middleware) → `*.controller.ts` (HTTP concerns) → `*.service.ts`
(business logic, Prisma). Services call Prisma directly — there is deliberately
no repository layer; Prisma is the data-access abstraction.

### Authorization is declared at the route

`middleware/authorize.middleware.ts` resolves the owning project from whatever
id a route carries (`projectId`, `imageId`, `versionId`, `commentId`), checks the
caller's role against a minimum, and publishes the resolved scope for the
handler:

```ts
router.post(
	"/:imageId/versions",
	requireProjectRole("EDITOR", projectIdFromImageParam("imageId")),
	discardStagedUploadsWhenRequestEnds,
	upload.fields([...]),
	imageController.uploadImageVersion
)
```

Two properties matter. Authorization runs **before** multer, so an unauthorized
request never writes bytes to disk. And handlers read the caller through
`authorizedScope(res)`, which **throws** when the middleware is absent — a route
added without a role check fails loudly instead of silently allowing everyone.

### Sessions

`lib/tokens.ts` signs cookies carrying `{id, typ, ver, jti}`. `typ` separates
user from admin sessions so one can never be replayed as the other; `ver` is the
user's `tokenVersion`, bumped on password change so every other session dies;
`jti` identifies the session so logout can revoke exactly it (a `RevokedSession`
row, pruned hourly). `lib/config.ts` refuses to boot in production without a
strong `JWT_SECRET`.

### Delegated access

People, AI assistants and scripts reach the same routes. `authenticateJWT`
accepts either the session cookie or an `Authorization: Bearer` token (an OAuth
access token whose audience is the API, or a personal access token) and records
how the caller authenticated on `req.auth` and in the request context. Scopes
mirror role tiers, and `requireProjectRole(minimum)` demands the matching scope
from token callers automatically; routes outside a project declare
`requireScope`, and security-critical ones are `sessionOnly`. A test fails if
any token-reachable route declares neither. Audit entries written during a
delegated request carry the app and grant that acted. The full design, including
the MCP server and token exchange, is in [ai-integration.md](ai-integration.md).

### Ports & adapters (where they pay off)

Interfaces exist only at seams where implementations genuinely swap:

- **Storage** (`src/storage/storage.ts`): `store(file)` / `remove(url)`. `LocalStorage` keeps files under `apps/api/uploads` (served at `/uploads`); `S3Storage` targets any S3-compatible store and returns absolute URLs. Selected at boot by the `S3_BUCKET` env var. Uploads are staged to disk by multer, then handed to the adapter.
- **Email** (`modules/notifications/email.service.ts`): no-ops cleanly when SMTP is unconfigured.
- **Presence** (`lib/presence.ts`): in-memory map is authoritative per instance, mirrored to Redis when available.

### Renditions

Uploads are accepted in formats browsers cannot display, then normalised server-side so review always works on something viewable. The original is stored as the version's `url`; the viewable derivative goes in `proxyUrl`, and every consumer prefers `proxyUrl || url`. `needsBrowserSafeImageRendition()` in the upload middleware decides which images need one (TIFF, PSD, TGA, EXR, DPX, JPEG 2000, PCX → PNG via `image-pipeline.ts`); every video gets one regardless of container (`video-pipeline.ts`). Formats with no decoder anywhere in the stack — HEIC/HEIF (the bundled ffmpeg has no HEIF demuxer), camera RAW, SVG (deliberately, as an XSS vector), STEP/IGES, SBSAR — are refused at the boundary, and the browser refuses them before uploading.

### Review workflow

`modules/reviews` records one decision per reviewer per version
(`APPROVED` / `CHANGES_REQUESTED`, with an optional note). The version's
`reviewStatus` is denormalised from those decisions inside the same transaction
so list queries stay a single indexed read; a single `CHANGES_REQUESTED`
outweighs any number of approvals. Decisions are audited, announced on the
version's socket room, and notified to the rest of the project.

### Revision check

`modules/reviews/revision-check.service.ts` answers "which earlier feedback
should this version address?" with every open top-level comment on a lower
version number of the same file, plus anything already checked on this version.
A verdict is one `RevisionCheck` row per comment per version. `FIXED` resolves
the original comment (only its author or an EDITOR may), and remembers that it
did, so undoing the verdict — or a later `NOT_FIXED` on the same version —
reopens it; a resolution made some other way is never undone. `NOT_FIXED` leaves
the comment open, so it reappears on the next version with a note of where it
was last flagged. Verdicts are audited and announced on the version's socket
room. In the viewer, focusing an item reuses the comment's own anchor (seek,
page or camera flight) and overlays its drawing on the new version.

### Visual version diff

Compare view offers modes per media type. Images get swipe, onion skin and a
CSS `difference` blend; `lib/image-diff.ts` also diffs both images on a
canvas scaled to at most 768 px, groups changed 16 px cells into regions with a
flood fill, and outlines them. Models get a deviation heatmap
(`components/ModelDiffView.tsx`, `lib/model-diff.ts`): both GLBs are merged
into world-space geometry, a BVH (three-mesh-bvh) is built over the earlier
version, and every vertex of the later one is measured against its surface in
time-sliced chunks so large models stay responsive. Distances below an
adjustable tolerance (0.5% of the comparison's diagonal by default) stay
neutral; larger ones ramp to red. Both models are compared in their own
coordinates, so revisions exported from the same scene line up exactly.

Side-by-side panes share a small sync channel (`lib/camera-link.ts`): model
viewers publish camera moves, video players publish play, pause, seek and rate
events, and each pane applies the others' events without re-broadcasting them.

### Video proxy pipeline

Two renditions are made from one ffmpeg run: a full one capped at 1080p and,
when the source is larger than 540p, a lighter 540p one stored in
`proxyLowUrl`. Both are encoded at a constant frame rate equal to the
source's average rate and carry a keyframe every second, so the player's frame
stepping (which seeks to the middle of the target frame) lands on real frames
and scrubbing seeks quickly. Neither rendition is ever upscaled. ffprobe also
reads the camera's start timecode from the container or a QuickTime timecode
track into `startTimecode`; the player, comment chips, CSV report and marker
exports offset their SMPTE timecode by it. The player chooses the 540p
rendition automatically on narrow screens, Data Saver and slow connections;
viewers can override that per browser.

Uploaded videos are transcoded in the background to a web-friendly H.264/AAC MP4
capped at 1080p (`modules/media/video-pipeline.ts`, ffmpeg via `ffmpeg-static`).
The upload request copies the staged file aside, stores the original, marks the
version `proxyStatus: PENDING` and returns immediately; a queue transcodes,
probes the real duration and frame rate with ffprobe, generates a poster frame
when the client didn't supply one, stores the results through the storage port
and marks the version `READY` (or `FAILED` — the player falls back to the
original file). Completion is pushed to viewers over the version's socket room as
`version-updated`.

Both the video and image queues share `rendition-queue.ts`, which bounds
concurrency (`VIDEO_WORKER_CONCURRENCY`, `IMAGE_WORKER_CONCURRENCY`), stamps
each job with the processing instance's id, and moves the job's source to
`source-<versionId>` in that instance's scratch directory. The instance id is
stable across restarts (`SCULPT_INSTANCE_ID`, or one generated once and kept in
`uploads/.instance-id`), so `rendition-recovery.ts` can resume its own pending
jobs at boot from those sources and fail only the ones whose source is gone.
Owned jobs are heartbeated every minute; a sweep fails pending jobs whose owner
has been silent for ten minutes and removes that owner's scratch space, so a
replica that dies never leaves media stuck in "processing".

### Resumable uploads

Files of 32 MB or more are sent through `/api/uploads` instead of a single
multipart request (`lib/resumable-upload.ts` in the web app). A session is
opened against the target project (role-checked like the ordinary upload),
chunks of up to 8 MB are written at an explicit byte offset, and a chunk sent at
the wrong offset is refused with 409 and the offset to resume from, so a client
that lost track simply continues. The browser retries with backoff, waits while
the device is offline, and remembers the session per file so a reload resumes
rather than restarts. When the last byte arrives the content is checked against
the declared type; the ordinary upload route then names the finished session in
`uploadIds`, and `attachResumableUploads` moves the file into staging as if
multer had written it, so authorization, signature checks, transcoding and
cleanup are shared with every other upload. Sessions live as files under
`uploads/.staging/resumable` and are reaped after a day without activity.

### 3D model ingest

3D formats are normalised in the **browser**, not on the server: `lib/model-capture.ts` loads the upload with the matching three.js loader (FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF, WRL), renders a transparent-PNG thumbnail from an offscreen WebGL canvas, and re-exports the scene as GLB with `GLTFExporter`. The original file is stored as the version's `url` and the GLB lands in `proxyUrl` — the same columns the video pipeline uses — so the viewer, pins and compare view only ever deal with GLB. three.js and every loader are dynamically imported so they stay out of the main bundle and never execute during server rendering. Formats requiring a CAD kernel (STEP, IGES) or a proprietary SDK (SBSAR) are not supported.

The viewer (`components/ModelAnnotationCanvas.tsx`) normalises every model to the same size around the origin, then frames it for the canvas's aspect ratio. Its toolbar offers fitted camera views, clay, wireframe and normals shading, studio lighting from three's procedural `RoomEnvironment` (no HDRI download, so it works offline), a ground grid, a turntable, a section plane (renderer clipping along X, Y or Z), point-to-point measurement reported in the model's own units, model statistics from `lib/model-inspection.ts`, animation playback (models are cloned with `SkeletonUtils` so skinned meshes keep their bones), and PNG export for people allowed to download. In compare view the two viewers share a `CameraLink`, so orbiting one moves the other.

Compressed glTF is handled in both the viewer and the thumbnail pass via `lib/gltf-decoders.ts`: **Draco** geometry, **KTX2/Basis** textures and **EXT_meshopt_compression**. The decoders ship inside the `three` package and are copied to `public/three/` by `npm run copy-decoders` (wired to `predev`/`prebuild`), so a self-hosted instance never fetches them from a CDN and works fully offline. `public/three/` is generated, not committed.

### Hot-path caching

Every request verifies a session and most resolve a project membership. Three
small in-process TTL caches (`lib/ttl-cache.ts`) keep that off the database:
verified sessions (5 s, keyed by token id), membership roles (5 s), and the
immutable id → project and stored file → project mappings (60 s). Only
positive answers are cached, so a fresh grant is seen at once. Every write that
changes access — logout, password change, role change, removal, leaving,
joining, account and project deletion — evicts the affected entries on the
instance that made it; other replicas converge within the TTL.

### Real-time

`realtime/socket.ts` owns the Socket.IO server. Connections are rejected unless they carry a valid session cookie, and identity
always comes from that session — never from the client's payload. Clients join
rooms per user (`user:<id>`), per project (`project:<id>` — every project the
user belongs to is joined server-side on connect, and `joinProject` adds one
joined later, membership-checked) and per image version (`imageVersion:<id>`, membership-checked); services emit
domain events (`comment-updated`, `comment-deleted`, `review-updated`,
`notification`, …) into those rooms.

With `REDIS_URL` set, the Redis adapter fans events out across replicas and
presence lives in Redis (a TTL-refreshed set per user), so `isUserOnline` — and
therefore the offline-email fallback — is correct behind more than one instance.
Without Redis a single instance still works fully; the log says so at boot.

### Media delivery

Stored media is served through `GET /uploads/:filename`, which authenticates
the caller, maps the stored path to its project through the `MediaAsset` table (a
primary-key lookup), verifies membership, and then either streams from disk or —
for S3 — redirects to a short-lived presigned URL. Removing someone from a
project actually revokes their access to its files. The one exception is opting
out with `S3_PRIVATE=false`: media is then written as public bucket URLs that
bypass the membership check entirely, and the server warns about it at startup.

### Audit logging

`modules/audit/audit.service.ts` records who did what to which object, when,
from where. Coverage is every change to data or access (sign-in and its
failures, lockouts, two-factor events, profile and preference changes, roles,
membership, invitations, share links, project settings, media, versions,
folders, comments including edits and deletions by their authors, reviews and
due dates, exports), every permission refusal (`access.denied`), failed
share-link and invitation attempts, every view or download of an original,
proxy or attachment (`media.accessed`), and every admin read of users,
projects or the audit trail itself. High-volume events go through
`recordAuditOnce`, which writes one entry per actor and object per fifteen
minutes per instance, so a video seek or a retry loop cannot flood the table.

Each entry carries actor, action, target, metadata, source IP, user agent and
the request id (`lib/request-context.ts` keeps them in AsyncLocalStorage and
echoes `X-Request-Id`). The actor is a plain id with no foreign key, so
entries stay attributable after the account is deleted; the admin view shows
"Deleted account" with that id.

**Tamper evidence.** Writes are serialized by a Postgres advisory lock. Each
entry gets the next `sequence` and `hash = sha256(canonical entry + prevHash)`,
so altering, inserting or deleting an entry breaks every hash after it.
`verifyAuditChain()` recomputes the chain and reports the first broken
sequence; retention may trim the oldest entries, which only moves the anchor.
A database trigger rejects every `UPDATE` on the table, and each entry is also
emitted as an `audit` log line (ids and hash, no personal data) so a log
pipeline holds an independent copy. Entries written before chaining existed are
reported as unverifiable rather than failed.

Writes are best-effort: a failed write is logged and counted in
`sculpt_audit_write_failures_total` but never fails the user's request. Admins
filter by action, actor, target, IP and date, export CSV, and verify the chain
at `/admin/audit`. See [compliance.md](compliance.md) for how this maps to
SOC 2, ISO 27001, GDPR and TPN.

### Errors

`lib/errors.ts` defines a small `AppError` hierarchy (`NotFoundError`,
`ForbiddenError`, `ValidationError`) carrying HTTP status codes. Controllers
translate them through one helper, `respondWithError` (`lib/http.ts`), which maps
known errors to their status and everything else to a logged `500` with a generic
body — unknown failures never become 4xx, and internal error objects never reach
a client. Request bodies and query strings are validated by zod schemas
(`*.schema.ts`) declared on the route.

### Retention and monitoring

Background jobs share `lib/schedule.ts`, which never overlaps a run with the
previous one. Revoked sessions are pruned hourly, notifications after
`NOTIFICATION_RETENTION_DAYS` (default 90) and audit entries after
`AUDIT_RETENTION_DAYS` (default: never). With `METRICS_TOKEN` set,
`GET /metrics` serves Prometheus metrics: request latency by route template,
realtime connections, queue depths and Node process metrics.

### Logging

`lib/logger.ts` writes one JSON object per line in production (`level`,
`message`, `time`, plus context) and a readable form in development, filtered by
`LOG_LEVEL`. It exists so operational output carries no user content: log lines
reference ids, not comment text or email addresses.

## Frontend

Next.js 15 App Router with React 19. Conventions:

- `src/app/` — routes; `src/components/` — feature components; `src/components/ui/` — shadcn/ui primitives (Radix-based); `src/context/` — Auth, AdminAuth and Socket providers; `src/lib/` — utilities.
- Styling is Tailwind CSS v4 with the shadcn "new-york" preset; icons are lucide-react; toasts via sonner.
- Media URLs go through `mediaUrl()` (`src/lib/utils.ts`), which passes absolute object-store URLs through and prefixes relative ones with the API origin.

## Data model

PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`): `User` →
`ProjectMember` → `Project` → `Image` → `ImageVersion` → `Comment`
(self-referencing for threads) plus `CommentLike`, `Review`, `Notification`,
`ShareLink`, `ProjectInvitation`, `MediaAsset`, `PasswordResetToken`,
`RevokedSession` and `AuditLog`. Media binaries live outside the database (disk or
object store); rows store the URL, and `MediaAsset` maps each stored path back to
its project so delivery can be authorized in one lookup.

Every foreign key used on a read path is indexed. This is load-bearing: a July
2025 migration dropped the indexes on `Comment`, `CommentLike`, `Image` and
`ImageVersion` and nothing restored them, so project and comment views ran
sequential scans until they were reinstated. `@@unique([imageId, versionNumber])`
makes concurrent version uploads a constraint violation the service retries,
rather than silently duplicated version numbers.

## Testing

Vitest (`apps/api` and `apps/web`, `npm test`). Tests target behavior that can actually regress: authorization rules (owner-only mutations, comment resolve ownership), comment anchor validation, the video pipeline's status transitions, storage adapters (URL derivation, delete guards), audit resilience and pagination, and CSV report escaping. Prisma, ffmpeg and the socket server are mocked at module boundaries; the local storage adapter is tested against a real temp filesystem.

A browser smoke suite lives in `e2e/` (`npm run smoke` with both dev servers up): it logs in through the real UI, uploads every supported media type, opens each viewer, comments, places a 3D pin and waits for the video proxy to transcode — failing on unexpected console errors.
