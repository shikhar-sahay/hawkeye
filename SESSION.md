# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-24
- **Session ID**: 2026-08-24-03 (dashboard usability & hardening)
- **Branch**: master

---

## Current Milestone Status

| Milestone | Status | Progress | Target | Achieved |
|-----------|--------|----------|--------|----------|
| **1: Backend MVP** | ✅ COMPLETE | 100% | 2026-07-27 | 2026-07-24 |
| **2: WebSocket Backend** | ✅ COMPLETE | 100% | After M1 | 2026-07-24 |
| **3: Frontend Dashboard** | ✅ COMPLETE | 100% | After M2 | 2026-08-02 |
| **3.5: Dashboard Polish + Functionality** | ✅ COMPLETE | 100% | After M3 | 2026-08-24 |
| **4: Browser Security Agent** | 🟢 IN PROGRESS | ~20% | After M3.5 | — |
| **5: SDK Integrations** | ⏳ PLANNED | 0% | After M4 | — |
| **6: Attack Replay & Docs** | ⏳ PLANNED | 0% | After M5 | — |

---

## Current Active Engineering Task

### Task ID: DASH-USABLE-01 — Make the dashboard genuinely usable/stable
### Status: **COMPLETE**

**Summary:** Systematic frontend audit + P0/P1 fixes across auth, routing, all
pages, search, notifications, settings, WebSocket, and backend integration.

### What was done (by area)

1. **Typecheck infrastructure repaired (P0)**
   - Root `tsconfig.json` had `include: []` → bare `tsc --noEmit` compiled
     NOTHING; ~43 real errors were hidden, including two app-crashing bugs.
   - Fixed config + all 43 errors. `npm run build` now performs a REAL check.
   - Crashes fixed: Alerts page missing `selectedAlert` state (clicking any
     alert threw ReferenceError); AlertDetail/IncidentDetail missing
     `CardDescription`/`cn` imports (Evidence/MITRE/Actions tabs crashed).

2. **Authentication (P0)**
   - Removed hardcoded demo API key from `api/client.ts` AND the
     `frontend/.env` VITE_API_KEY that Vite was inlining into bundles.
   - New `/login` page: validates key against backend, precise error messages,
     stores key in localStorage only on success.
   - `RequireAuth` gate on all dashboard routes with return-to-page redirect;
     global unauthorized event routes expired keys back to login.
   - Backend: ALL `/sources/*` endpoints now require a valid API key, except
     `POST /sources` which stays open only for first-source bootstrap.
     (Previously source CRUD/API-key management was fully unauthenticated.)

3. **Events (P1)** — new EventDetail dialog (click any row); debounced search;
   Previous/Next pagination replacing broken Load More; live-event dedupe;
   `?event=` deep links.

4. **Alerts / Incidents (P1)** — server-side search (debounced); honest
   pagination; status column; incident affected_ip filter now works (backend
   filter was a no-op `pass`); `?alert=`/`?incident=` deep links.

5. **Sources (P1)** — server-side search + new backend `is_active` filter;
   removed wrong per-row API-key count; rotate preserves expiry; `?source=`
   deep link.

6. **Settings (P1)** — `?tab=` support (Profile/Security Settings nav works);
   real WebSocket status + working connect/disconnect; working connection test;
   removed fake API-endpoint setting; notification/auto-refresh settings now
   actually consumed by TopNav/Dashboard.

7. **Dashboard (P1)** — fake "Events Today" KPI replaced by Resolved Alerts;
   mislabeled "(24h)" stats corrected; auto-refresh from Settings.

8. **Notifications/Search (P2)** — dedupe by entity id; notifications link via
   working deep links (previously dead routes); respect enable/disable setting.

### Verification performed
- Backend tests 33/33 PASS; tsc clean (real project-wide); vite build PASS;
  lint PASS (4 pre-existing fast-refresh warnings).
- Runtime: uvicorn + Vite dev server up; all SPA routes 200 incl. `/login`;
  `/api` proxy 200; WS connected + ping/pong through proxy and direct.
- E2E pipeline test: batch-ingested failed logins → BruteForceDetector fired →
  alert broadcast received over WebSocket.
- Auth matrix verified at runtime: sources list/create without key → 401;
  with valid key → 200; health public.
- Security scan of built bundle: no `hawk_*` key material present.

### Known limitations of verification
- No browser automation available in this environment; verification is
  HTTP-level + build/typecheck. A human should click through the UI once.

### Next Action (recommended next task)
1. Manual browser pass over the app (login → each page → interactions).
2. Continue T-040 browser-agent TS fixes (8 known typecheck errors).

---

## Quick Reference Commands

```bash
# Backend
pytest tests/ -q                    # All tests (33 pass)
uvicorn hawkeye.main:app --reload   # Dev server (port 8000)

# Frontend
cd frontend
npm run dev                         # Dev server (:5173, proxies /api + /ws to :8000)
npm run build                       # tsc --noEmit -p tsconfig.app.json && vite build (REAL typecheck)
npx tsc --noEmit -p tsconfig.app.json   # Typecheck only
npm run lint

# Demo data (writes directly to DB; unaffected by API auth)
python scripts/seed_demo_data.py
```

## Notes for next agent
- The demo key `hawk_F5I...` lives ONLY in `scripts/seed_demo_data.py`
  (DB seeding) — it is no longer referenced by any frontend code.
- Frontend typechecks MUST use `-p tsconfig.app.json`; bare `tsc --noEmit`
  compiles nothing (root tsconfig keeps references for editor tooling).
- Deep-link contract: `/events?event=N`, `/alerts?alert=N`,
  `/incidents?incident=N`, `/sources?source=N`.
