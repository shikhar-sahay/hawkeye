# Hawkeye Deployment Guide: Vercel + Supabase ($0)

This document describes the production deployment architecture: the React
frontend and FastAPI API served from **Vercel** (static SPA + Python
serverless functions), with **Supabase** providing managed PostgreSQL and
Realtime fan-out. No Render dependency remains in the active architecture.

Nothing here claims a completed deployment: steps needing dashboard access
are explicitly marked manual. The legacy Render/Flask deployment is
untouched; see section 8.

---

## 1. Architecture overview

```
Browser (public Vercel URL)
  |-- REST /api/v1/*  -->  Vercel Python function (FastAPI via api/index.py)
  |                            |-- auth: HawkEye source API keys (unchanged)
  |                            |-- ingest -> normalize -> detect -> correlate
  |                            |-- reads/writes Supabase Postgres (service role)
  |                            +-- mints Realtime JWTs (source-scoped, 1h TTL)
  |
  +-- Realtime  -->  Supabase Realtime (postgres_changes, RLS source-scoped)
                         ^
Supabase Postgres  ------+-- tables + RLS + publication (supabase/migrations)
```

- **Frontend**: static SPA (`npm run build` in `frontend/`). No server code.
- **API**: the existing FastAPI app, exported unchanged from `api/index.py`
  and served by Vercel's Python runtime. Same routes, same validation, same
  detection/correlation code as local uvicorn.
- **Database**: Supabase managed PostgreSQL, schema from
  `supabase/migrations/*.sql` (generated from the SQLModel models plus
  hand-written RLS/publication).
- **Realtime**: Supabase Realtime `postgres_changes` on `normalized_events`,
  `alerts`, `incidents`, filtered per source by RLS. The raw WebSocket
  server (`hawkeye/api/websocket.py`) remains for local development only.
- **Local development is unchanged**: `uvicorn` + SQLite + raw WebSocket,
  selected automatically when `VITE_SUPABASE_URL` is unset.

## 2. Why this shape (and what was ruled out)

1. **WebSockets cannot run on Vercel serverless**, and the old
   ConnectionManager state (sessions, replay history, counters) is
   process-local by design. Supabase Realtime replaces fan-out instead of
   porting it.
2. **Detection/correlation stay in Python, inline in the ingestion request.**
   The detectors are portable SQLModel queries plus in-memory scoring; moving
   them to TypeScript, PL/pgSQL, or the browser was rejected (rewrite risk,
   secret/logic exposure). Measured locally: single ingest ~15ms, 50-event
   batch ~1.8s, 100-event batch ~8.3s with superlinear growth, so the batch
   cap is 50 per request (see `BatchEventsIngest`; backfills chunk
   client-side).
3. **The HawkEye source API-key model is preserved.** Supabase Auth is not
   used: a SIEM with machine keys and no human users gains nothing from a
   user model, and adopting one would rewrite auth everywhere. Realtime
   identity comes from short-lived custom JWTs minted server-side after
   API-key validation (`POST /api/v1/realtime-token`).
4. **Vercel Hobby fits**: static hosting has no sleep; function invocations
   (dashboard REST + ingestion) sit orders of magnitude under the ~1M/mo
   allowance at portfolio traffic; the 10s timeout envelopes the measured
   pipeline with the batch cap in place.
5. **Supabase Free fits with one accepted risk**: 500MB database (demo
   footprint is ~62MB), 5GB egress, 200 concurrent Realtime connections, 2M
   Realtime messages/mo, 500K Edge Function invocations/mo (we use zero -
   no Edge Functions in this architecture). **Free projects pause after 7
   days of inactivity and need manual restore.** Mitigate with a weekly
   keep-alive ping (e.g. scheduled GitHub Action hitting `/health`); be
   honest that this works against the spirit of the policy and that a
   Pro upgrade ($25/mo) is the clean fix if it ever matters.

## 3. Environment variables

### Vercel project (Root Directory = repository root)

Build: `cd frontend && npm ci && npm run build`, output `frontend/dist`.
`vercel.json` at the root maps `/api/*` to the Python function and falls
back to the SPA.

| Variable | Scope | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Production + Preview | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Production + Preview | anon/public key (safe: RLS denies everything except source-scoped reads) |
| `DATABASE_URL` | Production only (server) | `postgresql+asyncpg://postgres:<pw>@db.<project>.supabase.co:6543/postgres` (pooler port; add `?ssl=require` form `sslmode=require` per Supabase docs if required) |
| `SUPABASE_JWT_SECRET` | Production only (server) | project JWT secret (signs realtime tokens) |
| `ENVIRONMENT` | Production only (server) | `production` (disables `/docs`) |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | Production only (server) | `2` / `3` (small: serverless instances fan out, Supavisor pools) |
| `DB_PREPARED_STATEMENT_CACHE_SIZE` | Production only (server) | `0` (required behind Supavisor transaction pooling) |
| `HAWKEYE_SKIP_CREATE_ALL` | Production only (server) | `1` (schema comes from migrations) |
| `HAWKEYE_DISABLE_HEARTBEAT` | Production only (server) | `1` (no persistent connections serverless) |

CRITICAL: never put `SUPABASE_SERVICE_ROLE_KEY`... note: this backend does
not use a service-role key at all. Database access from functions uses the
pooler URL above, whose password is a **server-only** variable and must
NEVER appear under `VITE_*`. Likewise `SUPABASE_JWT_SECRET`, API keys, and
the database password stay server-side. Only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are public by design.

### Supabase project
- Region: closest to the expected viewers (Vercel functions run globally;
  pick the region matching most traffic to minimize RTT).
- Apply `supabase/migrations/0001_schema.sql` then `0002_realtime_rls.sql`
  via the SQL editor (in order).
- Confirm: tables exist, RLS enabled, `supabase_realtime` publication
  includes the three streamed tables, `REPLICA IDENTITY FULL` on alerts +
  incidents.

## 4. Security model (summary)

- REST: HawkEye API keys (SHA-256 stored, expiry enforced, per-source
  ownership, bootstrap locked after first source/key). Unchanged.
- Realtime: custom JWT `{role: authenticated, source_id, iat, exp}` minted
  only after API-key validation; `source_id` is server-derived and cannot be
  influenced by query/body params (tested). RLS policies compare
  `source_id::text` to the JWT claim (text comparison fails closed on
  malformed claims instead of erroring). `anon` holds zero grants;
  non-streamed tables are RLS deny-all; all writes go through Vercel
  functions, never the browser.
- The anon key in the frontend bundle is public by design; RLS test suite
  (`tests/test_supabase_rls.py`, 7 tests, negative-heavy) proves isolation.

## 5. Deployment procedure (manual steps requiring dashboard access)

### 5.1 Supabase project
1. Create a new project (free plan). Save the database password, anon key,
   and JWT secret somewhere safe (password manager, never Git).
2. SQL editor: run `0001_schema.sql`, then `0002_realtime_rls.sql`.
3. Verify: 7 tables, RLS enabled on all, 3 source-isolation policies,
   publication members, replica identities.
4. Note the pooler connection string (port 6543) for `DATABASE_URL`.

### 5.2 Backend = Vercel Python function (same project as frontend)
No separate backend deployment exists. The same Vercel project serves the
SPA and `api/index.py`. Set the server-only variables from section 3,
then deploy and verify:
- `GET https://<app>/health` returns healthy (rewritten to the function;
  doubles as the keep-alive target).

### 5.3 Bootstrap the first source + key immediately
Same bootstrap semantics as always (open only while zero sources/keys
exist), against the production URL:
```bash
curl -X POST https://<app>/api/v1/sources -H "Content-Type: application/json" \
  -d '{"name": "production", "description": "First source"}'
curl -X POST https://<app>/api/v1/sources/1/api-keys \
  -H "Content-Type: application/json" -d '{"name": "dashboard"}'
```
Save `plain_key` (shown once, never in Git). Confirm lockdown: repeating
either call without the key returns 401. Start clean: never seed demo data
or reuse the development demo key in production.

### 5.4 Frontend on Vercel (same project)
Root Directory = repository root (uses root `vercel.json`). Set
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, deploy, verify:
- Landing, `/login`, `/get-started` render; sign-in with the production key
  reaches `/dashboard`.
- DevTools: XHR to same-origin `/api/v1/...`; Realtime socket to
  `wss://<project>.supabase.co`; status pill "Connected".
- Ingest an event: appears live without refresh; repeated failures raise a
  live alert and incident.
- No `localhost` traffic, no secrets in responses, no console errors.

### 5.5 Verification checklist before touching anything old
- [ ] Login works with the production key; invalid/expired keys rejected
- [ ] Dashboard stats, charts, events, alerts, incidents, sources load
- [ ] Live event/alert/incident appear without refresh
- [ ] Search, filters, time-series, refresh, themes, 404 behave
- [ ] Cross-source management returns 404
- [ ] Realtime token endpoint: 401 without key, 200 with key, claims carry
  the caller's source_id only
- [ ] Production build contains no service-role key, JWT secret, or DB
  password (grep `dist/`)
- [ ] Server logs contain no secrets or tracebacks

## 6. Cutover and rollback (only AFTER 5.5 passes)

- The legacy v1 service (`hawkeye-i1bt`) and the Render v2 backend config
  stay untouched until the new stack soaks. Rollback = keep using the old
  deployment; no data migration means nothing to unwind (production starts
  with a fresh database by design).
- Only after a soak period: suspend the old Render service, then remove
  `render.yaml`/`Dockerfile` references from the active docs. Never delete
  `legacy-v1/` or the `legacy-v1-flask` tag (historical archive).

## 7. Recovery of the legacy implementation

```bash
git fetch --tags
git worktree add ../hawkeye-legacy legacy-v1-flask   # browse the full v1 tree
git checkout legacy-v1-flask -- legacy-v1/           # restore the directory
```
