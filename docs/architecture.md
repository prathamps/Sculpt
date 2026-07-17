# Architecture

Sculpt is a two-app monorepo: an Express API (`apps/api`) and a Next.js frontend (`apps/web`). The API owns all business logic and data; the frontend is a client of the REST API and the Socket.IO server.

## Backend

The API is a **modular monolith**. Code is organized by feature, not by technical layer — each module owns its routes, controller and service:

```
apps/api/src/
├── modules/
│   ├── auth/            # register/login/logout, OAuth (passport), user profile routes
│   ├── projects/        # projects, membership, share links
│   ├── media/           # images/videos, versions, upload endpoints
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

Vitest (`apps/api`, `npm test`). Tests target behavior that can actually regress: authorization rules (owner-only mutations, comment resolve ownership), storage adapters (URL derivation, delete guards), audit resilience and pagination, and CSV report escaping. Prisma and the socket server are mocked at module boundaries; the local storage adapter is tested against a real temp filesystem.
