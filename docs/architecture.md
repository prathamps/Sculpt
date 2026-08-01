# Architecture

Sculpt is a two-app monorepo: an Express API (`apps/api`) and a Next.js frontend (`apps/web`). The API owns all business logic and data; the frontend is a client of the REST API and the Socket.IO server.

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

### Video proxy pipeline

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
concurrency (`VIDEO_WORKER_CONCURRENCY`, `IMAGE_WORKER_CONCURRENCY`) and stamps
each job with the processing instance's id. Boot-time recovery therefore only
fails jobs **this** instance owned, plus long-unclaimed ones — restarting one
replica no longer cancels another's in-flight work, and each instance keeps its
own scratch directory.

### 3D model ingest

3D formats are normalised in the **browser**, not on the server: `lib/model-capture.ts` loads the upload with the matching three.js loader (FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF, WRL), renders a transparent-PNG thumbnail from an offscreen WebGL canvas, and re-exports the scene as GLB with `GLTFExporter`. The original file is stored as the version's `url` and the GLB lands in `proxyUrl` — the same columns the video pipeline uses — so the viewer, pins and compare view only ever deal with GLB. three.js and every loader are dynamically imported so they stay out of the main bundle and never execute during server rendering. Formats requiring a CAD kernel (STEP, IGES) or a proprietary SDK (SBSAR) are not supported.

Compressed glTF is handled in both the viewer and the thumbnail pass via `lib/gltf-decoders.ts`: **Draco** geometry, **KTX2/Basis** textures and **EXT_meshopt_compression**. The decoders ship inside the `three` package and are copied to `public/three/` by `npm run copy-decoders` (wired to `predev`/`prebuild`), so a self-hosted instance never fetches them from a CDN and works fully offline. `public/three/` is generated, not committed.

### Real-time

`realtime/socket.ts` owns the Socket.IO server. Connections are rejected unless they carry a valid session cookie, and identity
always comes from that session — never from the client's payload. Clients join
rooms per user (`user:<id>`), per project (`project:<id>`, membership-checked)
and per image version (`imageVersion:<id>`, membership-checked); services emit
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

Every security-relevant mutation is recorded via `modules/audit/audit.service.ts`: logins (including failures), role changes, project/membership changes, share-link lifecycle, media uploads/deletions and report exports. Entries capture actor, action, target, metadata and source IP. Writes are best-effort — a failed audit write is logged but never fails the user's request. Admins browse the trail at `/admin/audit`.

### Errors

`lib/errors.ts` defines a small `AppError` hierarchy (`NotFoundError`,
`ForbiddenError`, `ValidationError`) carrying HTTP status codes. Controllers
translate them through one helper, `respondWithError` (`lib/http.ts`), which maps
known errors to their status and everything else to a logged `500` with a generic
body — unknown failures never become 4xx, and internal error objects never reach
a client. Request bodies and query strings are validated by zod schemas
(`*.schema.ts`) declared on the route.

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
