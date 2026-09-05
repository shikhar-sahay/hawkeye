# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-09-05
- **Session ID**: 2026-09-05-01 (Migration-readiness audit: Vercel + Render + PostgreSQL)
- **Branch**: master (all work committed and pushed)

---

## Current Active Engineering Task

### Task ID: AUDIT-MIGRATE-01 — Migration-readiness audit (no migration performed)
### Status: **COMPLETE — verdict: READY WITH BLOCKERS (all fixed in-session)**

**What was done:**
1. Full audit of frontend / backend / database / deployment config /
   WebSockets / security / legacy-v1 separation / docs (see final report in
   chat; key evidence below).
2. Fixed all blockers found (commit `806dfba`):
   - Incident JSON-column `ILIKE` filters → `CAST(... AS VARCHAR)` (PG-safe).
   - Added `asyncpg` to `pyproject.toml` + `requirements.txt`.
   - Prod-safe login error message; `VITE_WS_URL` comment fix.
   - Dockerfile `HEALTHCHECK` honors `$PORT`.
   - `--force` production guards on seed/cleanup scripts.
3. Removed two stray empty dir husks (`frontend/browser-agent/`,
   `frontend/Work/...`, 0 files each, untracked).
4. Synced local dev `.env` `CORS_ORIGINS` with `.env.example` (was stale
   `:5000`, masked real CORS behavior during testing).

**Verification (this session):**
- `pytest tests/` → 36/36 (run with backend stopped; SQLite lock contention
  with a live server can hang the suite).
- `tsc --noEmit` clean; ESLint 0 errors; `vite build` passes; `vite preview`
  serves SPA fallback (`/` and `/alerts` → 200).
- Production bundle built with test `VITE_API_BASE_URL`/`VITE_WS_URL` values
  confirms hosts are inlined (cross-origin config path works).
- Live: backend health OK; CORS preflight 200 + ACAO echo for allowed
  origin, 401 without echo for evil origin; incident search + affected_ip
  filters 200 with correct results (after CAST fix); WS connects with valid
  key, handshake rejected (403) with bad key; ingest → dashboard live row
  verified; probe events cleaned up afterwards.
- PG DDL for all 7 tables + 41 index/constraint statements compiles cleanly
  for the `postgresql` dialect (SERIAL PKs, TIMESTAMP WITHOUT TIME ZONE).
- `postgresql+asyncpg://` driver chain resolves (fails only at TCP connect -
  no PG server available locally, as expected).

**NOT verified (needs real environments):** actual PostgreSQL server
(end-to-end queries, `create_all`, JSONB behavior at runtime); Vercel deploy;
Render deploy; Docker image build (daemon not running); Render disk/Postgres
behavior; production TLS/WSS.

### Next Action
Migration tonight per the cutover plan in the final report (prepare PG →
deploy backend → verify → deploy frontend → verify → retire legacy Render).

---

## Notes for next agent
- Dev servers: frontend :5173 (vite dev, still running), backend :8000
  (fresh uvicorn, current code). Run only ONE uvicorn; stop it before pytest.
- Demo key `hawk_F5I...` lives ONLY in `scripts/seed_demo_data.py` - it is
  publicly known; NEVER run the seed script against production (now guarded).
- `legacy-v1-flask` tag intact; `legacy-v1/` untouched; old Render service
  untouched.
- Frontend split-deployment env: `VITE_API_BASE_URL`, `VITE_WS_URL` (empty =
  same-origin).
- SCALE-WS-01 (TODO.md): backend is single-instance by design until
  ConnectionManager state moves to Redis; `render.yaml`/Dockerfile pin
  `--workers 1`.

