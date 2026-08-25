# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-25
- **Session ID**: 2026-08-25-01 (FE polish: canonical logo, landing scale, pipeline ping)
- **Branch**: master (all work committed and pushed through 4fe2f36+docs)

---

## Current Active Engineering Task

### Task ID: UI-POLISH-02 — Landing scale, canonical logo, em-dash purge, pipeline ping
### Status: **COMPLETE**

**What was done (see CHANGELOG [2.8.1]):**
1. Checkpoint: leftover lint/typecheck fixes from UI-REDESIGN-01 committed;
   QA artifacts gitignored.
2. Canonical branding: HawkMark SVG deleted; `Logo` (hawkeyelogo.png) is the
   only mark, used in header, hero observation field, CTA, footer, GetStarted,
   404, login, dashboard sidebar/topnav, HawkLoader. favicon.svg + icons.svg
   removed; favicon + regenerated OG image use the canonical PNG.
3. Zero U+2014 em dashes in frontend (36+ replaced with context-appropriate
   punctuation; stat placeholders "..."; robots.txt cleaned).
4. Landing scale: hero h1 to 68px, xl body, bigger badge/CTAs/code, larger
   observation field (h-56 ring, 112px logo), pipeline nodes h-12 with
   text-lg titles, landing sections max-w-7xl.
5. Pipeline travelling ping: 8s loop along the rail, node ring pulses synced
   (2s/segment), vertical variant on mobile, hidden under reduced motion.
6. Header: full-viewport background/border with inner content aligned exactly
   to the landing grid (verified: header inner edges == hero edges).

**Verification:** tsc clean, lint 0 errors (4 pre-existing fast-refresh
warnings), build PASS, backend tests 33/33, Playwright sweep: landing at
320/375/430/768/1024/1280/1440/1600/1920 zero overflow, three themes verified,
dashboard unaffected (own components; 24h/7d/30d still work), reduced-motion
ping display:none, zero console errors. Em-dash search: 0. HawkMark search: 0.

### Next Action
Return to Milestone 4: T-040 browser agent scaffold (see TODO.md).

---

## Notes for next agent
- Dev servers: frontend :5173, backend :8000 (uvicorn --reload).
- Demo key `hawk_F5I...` lives ONLY in `scripts/seed_demo_data.py`.
- Theme storage key `theme` (light | dark | black); inline boot script in
  index.html must stay in sync with ThemeProvider.
- `.playwright-mcp/*.cjs` are QA scripts; `make_og.py` regenerates the OG
  image from hawkeyelogo.png.
- Known non-issues: ~900 polluted test sources in dev DB (see TODO
  DATA-HYGIENE-01); per-source vs global stat scope (STATS-SCOPE-01).
