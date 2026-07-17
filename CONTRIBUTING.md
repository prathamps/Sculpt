# Contributing to Sculpt

Thanks for your interest! Sculpt is MIT-licensed and contributions of all kinds are welcome — features, fixes, docs and tests.

## Getting set up

Follow the **Local development** section of the [README](README.md). In short: `docker compose up -d`, copy the two `.env.example` files, `npm install` in both apps, `npx prisma migrate dev` in `apps/api`, then `npm run dev` in each app.

## Project conventions

- **Feature modules** — backend code lives in `apps/api/src/modules/<feature>/` with `routes` → `controller` → `service`. New endpoints belong in the module that owns the domain concept; see [docs/architecture.md](docs/architecture.md).
- **Clean code over comments** — prefer small, well-named functions to explanatory comments. Comments are for constraints the code can't express.
- **Errors** — throw `AppError` subclasses (`lib/errors.ts`) from services; map them to HTTP responses in controllers.
- **Audit logging** — any new mutation that changes who can see or do what (auth, membership, roles, sharing, destructive actions) must record an audit entry via `modules/audit/audit.service.ts`.
- **UI** — build on the shadcn/ui primitives in `apps/web/src/components/ui`; use Tailwind utilities and `lucide-react` icons. Resolve media URLs with `mediaUrl()`.

## Before you open a PR

```bash
cd apps/api && npm run build && npm test
cd apps/web && npm run lint && npm run build
```

CI runs the same gates (plus `prisma validate`) and must pass. If you change the Prisma schema, include a migration (`npx prisma migrate dev --name <change>`).

Keep PRs focused, describe the behavior change, and add tests for logic that can regress — authorization rules, data transforms and anything security-relevant.
