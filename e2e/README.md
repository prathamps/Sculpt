# End-to-end smoke suite

Drives a real browser through the running app: login, uploading every
supported media type (image, video, PDF, 3D model), opening each viewer,
commenting, placing a 3D pin, and waiting for the video proxy pipeline to
finish. Fails on unexpected browser console errors.

## Requirements

- Both dev servers running (`npm run dev` in `apps/api` and `apps/web`),
  or set `SCULPT_API_URL` / `SCULPT_WEB_URL`.
- Google Chrome or Microsoft Edge installed (no browser download needed —
  the suite uses `playwright-core` against the system browser).
- Node 20+.

## Run

```bash
cd e2e
npm install
npm run smoke
```

Exit code 0 means every check passed. The suite creates a throwaway user
and project and deletes the project when it finishes.
