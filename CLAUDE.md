# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository. Follow these conventions so contributions stay consistent with the existing codebase.

## What Sculpt is

An open-source (MIT), self-hostable real-time visual collaboration platform: projects → images/videos → versions → location-anchored threaded comments → drawn annotations, with Socket.IO realtime, JWT + OAuth auth, share links, an admin panel, audit logging, and pluggable storage. There is **no paid tier** — never reintroduce billing, plan limits, or feature gating by payment.

Monorepo: `apps/api` (Express + Prisma + TypeScript) and `apps/web` (Next.js 15 App Router + React 19). See `docs/architecture.md` for the full map.

## Golden rules

1. **No comments — the code itself must be readable.** This codebase carries zero comments by policy. Express intent through small, well-named functions, named constants, and precise variable names; encode invariants in tests whose names state the rule. If you feel a comment is needed, refactor until it isn't. This applies to `//`, `/* */`, JSDoc, JSX comments, and Prisma schema comments alike.
2. **Every mutation is authorized.** No endpoint that reads or changes project data may rely on authentication alone. Check project membership and role (below). New endpoints without an access check are bugs.
3. **Audit security-relevant actions.** Anything that changes who can see or do what — auth events, role/membership changes, sharing, destructive actions, exports — must call `recordAudit(...)` (`apps/api/src/modules/audit/audit.service.ts`). Audit writes are best-effort and must never fail the request.
4. **Match the surrounding style.** Tabs for indentation, no semicolons in new TS where the file omits them, double quotes. Don't reformat untouched code.

## Backend conventions (`apps/api`)

- **Feature modules.** Code lives in `src/modules/<feature>/` as `*.routes.ts` → `*.controller.ts` → `*.service.ts`. Add new endpoints to the module that owns the domain concept; create a new module only for a genuinely new domain. Cross-cutting code is in `src/lib` (prisma, redis, presence, errors, cors), `src/storage` (storage port + adapters), `src/realtime` (Socket.IO).
- **Errors.** Throw `AppError` subclasses (`NotFoundError`, `ForbiddenError`, `ValidationError`) from services; map them at the controller boundary (`if (error instanceof AppError) res.status(error.statusCode)...`). Never map arbitrary `Error`s to 4xx — unknown failures are 500s.
- **Authorization helpers** live in `src/modules/projects/access.ts`: `getMemberRole`, `roleMeets`, `getImageProjectId`, `getVersionProjectId`. Role capability order is **VIEWER < MEMBER < EDITOR < OWNER**:
  - VIEWER: read projects/media/comments.
  - MEMBER: + create comments, likes, replies.
  - EDITOR: + upload media, add/delete versions, rename/delete media.
  - OWNER: + invite/remove members, manage share links, update/delete the project.
  Enforce with `roleMeets(role, "EDITOR")` etc. The media controller's `authorizeProject/Image/Version(req, res, id, minRole)` helpers are the pattern to copy.
- **Storage.** Never touch the filesystem or S3 SDK directly from a service. Go through `storage` (`src/storage`), whose `store`/`remove` are the only file operations. `remove` is best-effort. Media URLs may be relative (local disk) or absolute (S3) — don't assume.
- **Prisma** is the data layer; services call it directly (no repository layer). The password column is globally omitted — opt back in with `omit: { password: false }` only where needed. Schema changes require a migration (`npx prisma migrate dev --name <change>`).

## Frontend conventions (`apps/web`)

- **Components** in `src/components`; shadcn/ui primitives in `src/components/ui` (build on these, don't hand-roll buttons/dialogs/inputs). State via React Context (`src/context`). Utilities in `src/lib/utils.ts`.
- **Media URLs:** always resolve stored URLs with `mediaUrl()` — it passes absolute (S3) URLs through and prefixes relative ones with the API origin.
- **Roles on the client:** derive the caller's role from `GET /api/projects/:id/my-role` and gate UI with `roleAtLeast(role, "EDITOR")` (`src/lib/utils.ts`). Server-side checks are the source of truth; client gating is UX only.
- **Theme:** light and dark are both supported. Use semantic Tailwind tokens (`bg-background`, `text-muted-foreground`, `border-border`, `text-primary`, `text-destructive`), never hardcoded colors like `bg-gray-900` or `text-white`. Both themes must remain legible.
- **Accessibility is required, not optional:**
  - Every icon-only button needs an `aria-label`; decorative icons get `aria-hidden="true"`.
  - Toggles use `aria-pressed`/`aria-expanded`.
  - Inputs need an associated `<label>` or `aria-label` (placeholder is not a label).
  - Non-`<button>` click targets need `role="button"`, `tabIndex={0}`, and an Enter/Space `onKeyDown`.
  - Preserve visible focus (`focus-visible:ring-2 focus-visible:ring-ring`).
- **Responsiveness:** mobile-first, no horizontal page overflow. Wide content (tables, timelines) scrolls inside its own container. Test layouts at sm/md/lg.
- Prefer `sonner` toasts and the Radix `ConfirmationModal` over native `alert()`/`confirm()`.

## Commands

```bash
# API (apps/api)
npm run build        # tsc typecheck + build
npm test             # vitest
npx prisma migrate dev

# Web (apps/web)
npm run build        # next build (also typechecks)
npx tsc --noEmit     # fast typecheck
npm run lint

# Browser smoke suite (e2e/, needs both dev servers + system Chrome/Edge)
cd e2e && npm install && npm run smoke
```

## Before finishing a change

- API: `npm run build && npm test`. Web: `npx tsc --noEmit && npm run build`.
- For changes touching upload, playback, viewers, or auth flows, also run the browser smoke suite (`cd e2e && npm run smoke` with both dev servers up).
- Add tests for logic that can regress — authorization rules, data transforms, anything security-relevant. Tests live beside the code as `*.test.ts` and mock Prisma / the socket at module boundaries.
- If you changed the Prisma schema, include the migration.
- Never weaken an authorization check or remove an audit call to make something "work".
