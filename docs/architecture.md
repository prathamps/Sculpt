# Architecture

Sculpt is a two-app monorepo: an Express API (`apps/api`) and a Next.js frontend (`apps/web`). The API owns all business logic and data; the frontend is a client of the REST API and the Socket.IO server.

## Backend

The API is a **modular monolith**. Code is organized by feature, not by technical layer — each module owns its routes, controller and service:

```
apps/api/src/
├── modules/
│   ├── auth/            # register/login/logout, OAuth (passport), user profile routes
│   ├── projects/        # projects, membership, share links
│   ├── media/           # images/videos/PDFs/3D models, versions, uploads, video pipeline
│   ├── comments/        # threaded comments, likes, resolution
│   ├── notifications/   # in-app notifications + email fallback for offline users
│   ├── export/          # JSON/CSV report generation
│   ├── admin/           # admin auth, user/project management, stats
│   └── audit/           # audit log write + query service
├── storage/             # StoragePort + LocalStorage / S3Storage adapters
├── realtime/            # Socket.IO server (rooms, presence hooks)
├── middleware/          # JWT auth guards, multer upload staging
├── lib/                 # prisma client, redis, presence, error types
├── app.ts               # express app wiring (routes, CORS, static uploads)
└── index.ts             # entrypoint: http server + realtime attach
```

Within a module the flow is `*.routes.ts` (paths + auth middleware) → `*.controller.ts` (HTTP concerns, status mapping) → `*.service.ts` (business logic, Prisma). Services call Prisma directly — there is deliberately no repository layer; Prisma is the data-access abstraction.

### Ports & adapters (where they pay off)

Interfaces exist only at seams where implementations genuinely swap:

- **Storage** (`src/storage/storage.ts`): `store(file)` / `remove(url)`. `LocalStorage` keeps files under `apps/api/uploads` (served at `/uploads`); `S3Storage` targets any S3-compatible store and returns absolute URLs. Selected at boot by the `S3_BUCKET` env var. Uploads are staged to disk by multer, then handed to the adapter.
- **Email** (`modules/notifications/email.service.ts`): no-ops cleanly when SMTP is unconfigured.
- **Presence** (`lib/presence.ts`): in-memory map is authoritative per instance, mirrored to Redis when available.

### Renditions

Uploads are accepted in formats browsers cannot display, then normalised server-side so review always works on something viewable. The original is stored as the version's `url`; the viewable derivative goes in `proxyUrl`, and every consumer prefers `proxyUrl || url`. `needsBrowserSafeImageRendition()` in the upload middleware decides which images need one (TIFF, PSD, TGA, EXR, DPX, JPEG 2000, PCX → PNG via `image-pipeline.ts`); every video gets one regardless of container (`video-pipeline.ts`). Formats with no decoder anywhere in the stack — HEIC/HEIF (the bundled ffmpeg has no HEIF demuxer), camera RAW, SVG (deliberately, as an XSS vector), STEP/IGES, SBSAR — are refused at the boundary, and the browser refuses them before uploading.

### Video proxy pipeline

Uploaded videos are transcoded in the background to a web-friendly H.264/AAC MP4 capped at 1080p (`modules/media/video-pipeline.ts`, ffmpeg via `ffmpeg-static`). The upload request copies the staged file aside, stores the original, marks the version `proxyStatus: PENDING` and returns immediately; an in-process queue transcodes, probes the real duration with ffprobe, generates a poster frame when the client didn't supply one, stores the results through the storage port and marks the version `READY` (or `FAILED` — the player falls back to the original file). Completion is pushed to viewers over the version's socket room as `version-updated`. Jobs left `PENDING` by a crashed process are marked `FAILED` at boot.

### 3D model ingest

3D formats are normalised in the **browser**, not on the server: `lib/model-capture.ts` loads the upload with the matching three.js loader (FBX, OBJ, STL, PLY, DAE, 3MF, 3DS, USDZ, AMF, WRL), renders a transparent-PNG thumbnail from an offscreen WebGL canvas, and re-exports the scene as GLB with `GLTFExporter`. The original file is stored as the version's `url` and the GLB lands in `proxyUrl` — the same columns the video pipeline uses — so the viewer, pins and compare view only ever deal with GLB. three.js and every loader are dynamically imported so they stay out of the main bundle and never execute during server rendering. Formats requiring a CAD kernel (STEP, IGES) or a proprietary SDK (SBSAR) are not supported.

Compressed glTF is handled in both the viewer and the thumbnail pass via `lib/gltf-decoders.ts`: **Draco** geometry, **KTX2/Basis** textures and **EXT_meshopt_compression**. The decoders ship inside the `three` package and are copied to `public/three/` by `npm run copy-decoders` (wired to `predev`/`prebuild`), so a self-hosted instance never fetches them from a CDN and works fully offline. `public/three/` is generated, not committed.

### Real-time

`realtime/socket.ts` owns the Socket.IO server. Clients join rooms per user (`user:<id>`), per project (`project:<id>`) and per image version (`imageVersion:<id>`); services emit domain events (`comment-updated`, `comment-deleted`, `notification`, …) into those rooms. Presence tracking feeds the notification service so offline members get email instead.

### Audit logging

Every security-relevant mutation is recorded via `modules/audit/audit.service.ts`: logins (including failures), role changes, project/membership changes, share-link lifecycle, media uploads/deletions and report exports. Entries capture actor, action, target, metadata and source IP. Writes are best-effort — a failed audit write is logged but never fails the user's request. Admins browse the trail at `/admin/audit`.

### Errors

`lib/errors.ts` defines a small `AppError` hierarchy (`NotFoundError`, `ForbiddenError`, `ValidationError`) carrying HTTP status codes; controllers translate them at the boundary.

## Frontend

Next.js 15 App Router with React 19. Conventions:

- `src/app/` — routes; `src/components/` — feature components; `src/components/ui/` — shadcn/ui primitives (Radix-based); `src/context/` — Auth, AdminAuth and Socket providers; `src/lib/` — utilities.
- Styling is Tailwind CSS v4 with the shadcn "new-york" preset; icons are lucide-react; toasts via sonner.
- Media URLs go through `mediaUrl()` (`src/lib/utils.ts`), which passes absolute object-store URLs through and prefixes relative ones with the API origin.

## Data model

PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`): `User` → `ProjectMember` → `Project` → `Image` → `ImageVersion` → `Comment` (self-referencing for threads) plus `CommentLike`, `Notification`, `ShareLink` and `AuditLog`. Media binaries live outside the database (disk or object store); rows store the URL.

## Testing

Vitest (`apps/api` and `apps/web`, `npm test`). Tests target behavior that can actually regress: authorization rules (owner-only mutations, comment resolve ownership), comment anchor validation, the video pipeline's status transitions, storage adapters (URL derivation, delete guards), audit resilience and pagination, and CSV report escaping. Prisma, ffmpeg and the socket server are mocked at module boundaries; the local storage adapter is tested against a real temp filesystem.

A browser smoke suite lives in `e2e/` (`npm run smoke` with both dev servers up): it logs in through the real UI, uploads every supported media type, opens each viewer, comments, places a 3D pin and waits for the video proxy to transcode — failing on unexpected console errors.
