# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-24
- **Session ID**: 2026-08-24-04 (visual system + landing page overhaul)
- **Branch**: master

---

## Current Active Engineering Task

### Task ID: UI-VISUAL-01 — Design system, landing page, nav/branding fixes
### Status: **COMPLETE**

**What changed (see CHANGELOG [2.7.0] for detail):**
- Design tokens rebuilt (dark + light), semantic severity/status palette applied
  app-wide; fixed Severity Distribution legend root cause (nonexistent CSS token)
- Public landing page at `/` with real capabilities only; dashboard at `/dashboard`
- `/get-started` documents the API-key bootstrap path; no fake account system
- Sidebar: duplicate branding fixed, working mobile drawer, persisted collapse,
  active-route styling; header brand only below lg; h-14 header
- WebSocket status truthful (idempotent mount effect, 1008 auth handling);
  Sources Refresh gives explicit feedback + updated stamp
- AlertFeed/IncidentTimeline show skeletons during initial load

**Routing contract:** `/` public landing, `/login`, `/get-started`,
protected `/dashboard`, `/events`, `/alerts`, `/incidents`, `/sources`,
`/settings`. Deep links unchanged.

**Verification:** tsc clean, build PASS, lint PASS (4 pre-existing fast-refresh
warnings), backend tests 33/33, all routes 200 via dev server, WS handshake OK.
No browser automation available; a human visual pass is still recommended.

### Next Action
Human visual QA of landing/dashboard in both themes; then T-040 browser agent.

---

## Notes for next agent
- The demo key `hawk_F5I...` lives ONLY in `scripts/seed_demo_data.py`
  (DB seeding) — it is no longer referenced by any frontend code. It is the
  intended dev login for the dashboard (source: "Web Application").
- Frontend typechecks MUST use `-p tsconfig.app.json`; bare `tsc --noEmit`
  compiles nothing (root tsconfig keeps references for editor tooling).
- Deep-link contract: `/events?event=N`, `/alerts?alert=N`,
  `/incidents?incident=N`, `/sources?source=N`.
- Status vocabularies are backend-defined contracts (see AGENTS.md):
  alerts `new|processing|correlated|dismissed` via PATCH `/alerts/{id}`;
  incidents `open|investigating|contained|resolved|closed` via PATCH
  `/incidents/{id}/status`.
- Untracked `openapi.json` at repo root is a generated artifact from the
  running backend; useful for contract checks, now gitignored.

