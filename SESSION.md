# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-24
- **Session ID**: 2026-08-24-02 (repository orientation & reconciliation)
- **Branch**: master
- **Commit**: see git log — this session ended with the documentation commit series after `799de74`

---

## Current Milestone Status

| Milestone | Status | Progress | Target | Achieved |
|-----------|--------|----------|--------|----------|
| **1: Backend MVP** | ✅ COMPLETE | 100% | 2026-07-27 | 2026-07-24 |
| **2: WebSocket Backend** | ✅ COMPLETE | 100% | After M1 | 2026-08-02 |
| **3: Frontend Dashboard** | ✅ COMPLETE | 100% | After M2 | 2026-08-02 |
| **3.5: Dashboard Polish + Functionality** | ✅ COMPLETE | 100% | After M3 | 2026-08-24 |
| **4: Browser Security Agent** | 🟢 IN PROGRESS | ~20% | After M3.5 | — |
| **5: SDK Integrations** | ⏳ PLANNED | 0% | After M4 | — |
| **6: Attack Replay & Docs** | ⏳ PLANNED | 0% | After M5 | — |

---

## Current Active Engineering Task

### Task ID: BASELINE-STABILIZE — Repository Orientation & Reconciliation
### Status: **COMPLETE**

**Summary:** Full repository audit to establish a reliable development baseline before
continuing Milestone 4. No new product features were added.

**What this session did:**

1. **Git state reconciled**
   - Confirmed master was ahead of origin by 2 commits (`85d7631` WS consolidation,
     `799de74` refresh-button fixes) — now pushed.
   - Worktree `.claude/worktrees/dash-polish-issue3` contained older versions of
     StatsDashboard/WebSocketContext changes that were fully superseded by the main
     tree; worktree and its branch removed after diff verification.
   - Branch `backup-before-removing-claude` was a byte-identical snapshot of
     `42a4c06`; deleted after tree comparison confirmed zero unique content.

2. **Uncommitted DASH-POLISH-01 Issues 3–7 work committed in logical groups**
   (WebSocket lifecycle fix, time-range controls, backend search params, TopNav
   search/notifications/user-menu, browser-agent restructure, .gitignore, docs).

3. **Documentation reconciled with verified reality**
   - README.md rewritten (was two concatenated documents with contradictory status
     and wrong endpoint paths).
   - CLAUDE.md replaced with pointer to AGENTS.md (was a full duplicate handbook).
   - AGENTS.md updated: current milestones, single shared WebSocket architecture,
     `/api/v1/alerts/time-series` endpoint name (docs previously said `/over-time`
     which does not exist), browser-agent flat layout + known typecheck failures.

4. **Runtime verification performed** (see Verification Results below)

### Next Action (recommended next task)
Continue T-040 (Browser Security Agent scaffold): fix the 8 TypeScript errors in the
flat-layout browser-agent (`content/dom-monitor.ts`, `content/bot-detector.ts`,
`shared/api-client.ts`) so `npm run typecheck` passes, then remove the legacy
`browser-agent/src/` directory once parity is confirmed.

---

## Verification Results (this session)

- Backend tests: ✅ 33/33 PASS (`pytest tests/ -v`)
- Frontend build: ✅ PASS (`npm run build` = tsc --noEmit + vite build)
- Frontend lint: ✅ PASS (`npm run lint` — 4 pre-existing fast-refresh warnings)
- Runtime backend (`uvicorn hawkeye.main:app`): ✅ /health OK; all dashboard
  endpoints return data against seeded demo DB (alerts/stats, incidents/stats,
  events/query, sources, sources/event-counts, alerts/time-series, mitre-coverage)
- SPA routes `/`, `/events`, `/alerts`, `/incidents`, `/sources`, `/settings`: ✅ all HTTP 200 via Vite dev server
- Vite proxy: ✅ `/api/v1/alerts/stats` proxied 200
- WebSocket: ✅ `connected` handshake received on both direct `ws://localhost:8000/ws`
  and proxied `ws://localhost:5173/ws`

## Known Issues (verified, not yet fixed)

1. **browser-agent flat layout fails typecheck** — 8 TS errors
   (`npm run typecheck` in browser-agent/). Scaffold is WIP; legacy `src/` layout
   intentionally kept as reference until the flat layout compiles.
2. **Hardcoded demo API key** in `frontend/src/api/client.ts:35` — acceptable for
   local dev but must not ship to production.
3. **Backend ruff warnings (~57)** — style-only, tracked as T-034.
4. **Root package.json** is a stale GitHub-init artifact (no scripts); harmless.
5. **alembic/** is an empty scaffold (no alembic.ini) — planned for Milestone 6.
6. **Demo data timestamps are old** — charts may show empty windows for "today";
   re-run `scripts/seed_demo_data.py` if fresh data is needed.

## Files to Review First Next Session

1. `browser-agent/content/dom-monitor.ts` - fix TS errors (T-040 continuation)
2. `browser-agent/shared/api-client.ts` - fix StoredConfig id typing
3. `AGENTS.md` - developer handbook (updated this session)
4. `frontend/src/context/WebSocketContext.tsx` - primary WS implementation

---

## Previous Completed Tasks (Reference)

### BASELINE-STABILIZE (2026-08-24) — this session
Repository audit, logical commit reorganization of Issues 3–7 work, documentation
reconciliation, runtime verification. See CHANGELOG [2.5.0].

### DASH-POLISH-01 (Issues 1–7) (2026-08-17 → 2026-08-24)
- ISSUE-1: WebSocket consolidated to single shared connection; flickering fixed
- ISSUE-2: Refresh buttons use isFetching
- ISSUE-3: Interactive 24h/7d/30d time-range controls
- ISSUE-4: Global search autocomplete (+ backend search params)
- ISSUE-5: Real-time notification bell
- ISSUE-6: Functional profile/user menu with sign-out
- ISSUE-7: UX consistency polish

### T-039: Dashboard End-to-End Verification & Fixes (2026-08-17)
### T-031: Code-split Chart Components (2026-08-02)

---

## Quick Reference Commands

```bash
# Backend
pytest tests/ -v                    # All tests (33 pass)
ruff check hawkeye/                 # Lint (57 style warnings)
uvicorn hawkeye.main:app --reload   # Dev server (port 8000)

# Frontend
cd frontend
npm install                         # Install deps
npm run dev                         # Dev server (port 5173, proxies /api + /ws to :8000)
npm run build                       # TypeScript + Vite build
npm run lint                        # ESLint check

# Browser Agent (currently FAILS typecheck — known issue #1)
cd browser-agent
npm install
npx tsc --noEmit                    # Type check
```
