# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-26
- **Session ID**: 2026-08-26-02 (Login blocker + fresh-install bootstrap fix)
- **Branch**: master (all work committed and pushed)

---

## Current Active Engineering Task

### Task ID: FIX-AUTH-01 — Fresh-install login deadlock + backend-down error UX
### Status: **COMPLETE**

**What was done (see CHANGELOG [2.9.1]):**
1. Root-caused two login blockers:
   a) Fresh-install deadlock: first API key could not be created without an
      existing key. Fixed with `require_source_for_key_creation` (open while
      zero API keys exist).
   b) "Unknown error" on the login page when the backend is down (Vite proxy
      500 with text body defeated JSON error parsing). Client now maps 5xx to
      an actionable message; login preserves the entered key on 5xx.
2. Get Started step 3 + USER_MANUAL + README + AGENTS updated to the fixed
   bootstrap flow.
3. tests/test_bootstrap.py: 3 regression tests on isolated in-memory SQLite
   (NOTE: routes use `deps.get_session`, guards use `database.get_session` —
   override BOTH; use StaticPool for :memory:).

**Verification:** pytest 36/36 (33 + 3 new); tsc clean; lint 0 errors.
Browser: clean localStorage → invalid key shows clear message → demo key
signs in → dashboard fully populated (26.6K events, 5.6K alerts, 3 incidents,
5 sources, all charts); backend stopped → actionable error → backend started →
retry with preserved key lands on /dashboard.

### Next Action
Return to Milestone 4: T-040 browser agent scaffold.

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
