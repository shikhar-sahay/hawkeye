# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-26
- **Session ID**: 2026-08-26-03 (Dialog widths, side lists, refresh/search UX, Render->Vercel prep)
- **Branch**: master (all work committed and pushed)

---

## Current Active Engineering Task

### Task ID: DEPLOY-01 — UI detail/responsive fixes, refresh + search UX, deployment preparation
### Status: **COMPLETE**

**What was done (see CHANGELOG [2.9.2]):**
1. **Systemic dialog bug**: `DialogContent`/`AlertDialogContent` had both
   `max-w-lg` and `sm:max-w-lg` in base classes; tailwind-merge could not
   remove the `sm:` variant, so EVERY dialog was capped at 512px regardless
   of caller classes (clipped tabs/badges everywhere). Removed the duplicate;
   mobile width now `w-[calc(100%-2rem)] sm:w-full`.
2. Event detail widened to `md:max-w-3xl lg:max-w-4xl` (896px desktop).
3. Alerts/Incidents side lists: grid 3/5 + 2/5 with min-w-0; secondary
   columns appear at xl/2xl; title truncation responsive (200/260/320px).
   Fixed a 120px load-time overflow at 320px (timeline skeleton badges).
4. Dashboard got a manual Refresh button (invalidates all dashboard queries;
   verified 8 real network refetches; spinner + guard + toast). All other
   pages' Refresh verified to perform real fetches.
5. Global search resets on pathname change (sidebar nav, result click,
   back/forward verified; query-string nav unaffected).
6. Deployment prep: `frontend/vercel.json`, `.env.production.example`,
   configurable `VITE_API_BASE_URL`/`VITE_WS_URL` (typed), `render.yaml`
   blueprint, root `Dockerfile` + `.dockerignore`, v2 `requirements.txt`,
   removed stale root `package.json` + duplicate `vite.config.js`, footer
   docs link de-localized, robots/sitemap de-localized.
7. **legacy-v1 preserved**: annotated tag `legacy-v1-flask` (pushed to
   GitHub) + `legacy-v1/README.md` (status + recovery). Directory kept
   in-tree until the v2 deployment is verified. Old Render service
   (`hawkeye-i1bt`) deliberately NOT touched.
8. `docs/deployment.md` written (architecture audit, env vars, step-by-step
   Vercel/Render procedure, cutover + verification checklist).

**Verification:** pytest 36/36 (run with backend stopped - SQLite lock
contention with a live server can hang the suite; see AGENTS.md); tsc clean;
lint 0 errors; build PASS. Browser: alert detail 896px all tabs visible,
event detail 896px, incident detail 1024px, side lists readable 1024-1920,
zero page overflow at 320/390/768/1280/1440/1920 (incl. during load),
search + reset verified, refresh verified on all pages, 3 themes OK, 404 OK,
login + WebSocket OK.

### Next Action
Manual deployment steps in `docs/deployment.md` section 5 (need Render +
Vercel dashboard access), then Milestone 4: T-040 browser agent scaffold.

---

## Notes for next agent
- Dev servers: frontend :5173, backend :8000. Run only ONE uvicorn instance.
  NOTE: pytest can hang when the dev server holds the SQLite file - stop the
  backend before running the suite if it silently never finishes.
- Demo key `hawk_F5I...` lives ONLY in `scripts/seed_demo_data.py`.
- Theme storage key `theme` (light | dark | black); inline boot script in
  index.html must stay in sync with ThemeProvider.
- Frontend split-deployment env: `VITE_API_BASE_URL`, `VITE_WS_URL` (empty =
  same-origin; see frontend/.env.production.example and docs/deployment.md).
- legacy-v1 recovery: tag `legacy-v1-flask` (see legacy-v1/README.md).
- SCALE-WS-01 (TODO.md): backend is single-instance by design until
  ConnectionManager state moves to Redis.

