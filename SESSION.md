# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-26
- **Session ID**: 2026-08-26-01 (Search hardening, dashboard fixes, responsive QA, docs)
- **Branch**: master (all work committed and pushed)

---

## Current Active Engineering Task

### Task ID: QA-POLISH-03 — Search, dashboard functionality, responsive/layout, docs
### Status: **COMPLETE**

**What was done (see CHANGELOG [2.9.0]):**
1. Checkpoint commit of leftover small-screen responsive fixes (2980594).
2. Global search hardened in `TopNav.tsx`: server-side source search,
   stale-response guard, error state, match highlighting, keyboard
   scrollIntoView, Enter-selects-suggestion, mobile search panel.
3. Backend: implemented missing `DELETE /sources/{id}` (UI offered deletion,
   API returned 405); added auth to `PATCH .../api-keys/{key_id}`; rewrote
   `/sources/event-counts` from N+1 (3 queries/source) to 3 grouped queries.
4. Dashboard: Active Alerts semantics fixed (new+processing+correlated),
   "Resolved/suppressed" card replaced with "Dismissed Alerts", incident row
   chevron opens detail, alert feed resolves source names, events header
   wraps at 320px, mojibake dashes fixed, CORS default moved 5000→5173.
5. Data hygiene: `scripts/cleanup_test_sources.py` added and run; 1,098 empty
   QA sources purged (DATA-HYGIENE-01 closed).
6. Docs: `docs/USER_MANUAL.md` written; README updated (manual link, scripts,
   search/responsive notes, LICENSE); MIT LICENSE added; CHANGELOG 2.9.0.

**Verification:**
- `pytest tests/ -q` → 33/33 pass.
- `tsc --noEmit -p tsconfig.app.json` clean; `npm run lint` 0 errors
  (4 pre-existing fast-refresh warnings); `npm run build` PASS.
- Playwright: search + autocomplete + keyboard nav + deep links (desktop and
  390px mobile), alert detail tabs + dismiss action (toast + status update),
  incident detail, source create/delete via UI, settings save persistence,
  three themes, sidebar collapse/header alignment (240↔64px tracking),
  sign-out/sign-in, zero page-level horizontal overflow at
  320/390/768/1280/1440/1920.

### Next Action
Return to Milestone 4: T-040 browser agent scaffold (fix 8 TS errors in
`browser-agent/`, build, load unpacked, remove legacy `src/` layout).

---

## Notes for next agent
- Dev servers: frontend :5173, backend :8000. Run only ONE uvicorn instance:
  two instances on :8000 cause SQLite lock contention (symptom: pytest hangs
  indefinitely). If pytest hangs, check for stray python/uvicorn processes.
- Demo key `hawk_F5I...` lives ONLY in `scripts/seed_demo_data.py`.
- Theme storage key `theme` (light | dark | black); inline boot script in
  index.html must stay in sync with ThemeProvider.
- The dev DB now has exactly 5 seeded demo sources (ids 1-5) after cleanup.
- WebSocket "closed before the connection is established" console warning in
  dev is a benign StrictMode artifact (CONNECTING socket closed on the
  double-mount cleanup); not visible in production builds.
- `.playwright-mcp/*.cml/*.cjs` and root *.png screenshots are QA artifacts
  (gitignored or to be cleaned before commit).
