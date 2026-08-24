# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-25
- **Session ID**: 2026-08-24-05 (deep frontend audit + product-grade visual redesign)
- **Branch**: master (all work committed and pushed through 265555c)

---

## Current Active Engineering Task

### Task ID: UI-REDESIGN-01 — End-to-end frontend redesign
### Status: **COMPLETE**

**What was done (see CHANGELOG [2.8.0] for detail):**

Stage 1 — Backend: `/alerts/time-series` range-aware bucketing (hourly /
4-hourly / daily), bucket-grid alignment fix (7d series was all zeros),
gap-filled chronological output. 33/33 tests pass.

Stage 2 — Themes: light / deep blue / pitch black via next-themes
(themes=["light","dark","black"], default dark), `.black` token set (neutral
grayscale on #000), anti-FOUC inline script, animated theme transitions,
light-theme contrast fixes (primary 5.2:1, severity-high 4.94:1, warning
4.86:1), mojibake sweep.

Stage 3 — Landing redesign: HawkMark/HawkLoader/ObservationField brand
components (CSS-only motion, reduced-motion aware), SiteHeader (mobile drawer
with focus management) + SiteFooter, hero with animated observation field,
pipeline rail, event→alert→incident story (real schema fields), detection
matrix (real triggers + real ATT&CK IDs from correlation/engine.py),
dashboard preview (labeled representative data), FAQ, hawk CTA, mobile
sticky CTA.

Stage 4 — GetStarted: 5-step vertical timeline with copyable commands
(fixed broken curl quote), breadcrumbs, relationship strip.

Stage 5 — Chart fix: frontend range-aware tick formatting (HH:mm / Mon HH:mm /
Aug 04) + full-precision tooltips; DetectionTypeChart horizontal layout
(all labels visible).

Stage 6 — Site quality: branded 404, useRouteMeta per-route titles/meta,
robots.txt + sitemap.xml, generated OG image, skip links, main landmarks,
show-key tabIndex fix.

Stage 7/8 — Browser QA (Playwright + browser-qa + visual-review subagents):
fixed mobile drawer containing-block trap (header backdrop-blur), zero
horizontal overflow at 320–1440, incident timeline clipping (contain:inline-size)
+ mojibake glyphs, copy-button fallback, per-chart dashboard loading states,
login brand mark, mobile hero hawk, detection matrix stable expansion.

**Verification:** `tsc --noEmit -p tsconfig.app.json` clean, `npm run lint`
(4 pre-existing fast-refresh warnings), `npm run build` PASS, backend tests
33/33 PASS, Playwright pass over /, /get-started, /login, 404, dashboard
(24h/7d/30d ticks verified: `02:30…` / `Tue 01:30…` / `Jul 25…Aug 24`),
events, alerts, incidents, sources, settings; zero console errors; themes
switch fully in all three modes.

**Known non-issues / notes:**
- Dev DB contains ~900 polluted test sources ("Test Source", "Source N") —
  inflates "Registered Sources" and slows `/sources/event-counts` (~7s).
  Data hygiene task, not a UI bug.
- Dashboard "Active Alerts 0" vs "86 critical" badge: stats endpoint is
  per-source scoped while other cards are global — backend semantics, left
  as-is.
- WS auth still passes the API key as a query param (documented protocol).

### Next Action
Return to Milestone 4: T-040 browser agent scaffold (see TODO.md).

---

## Notes for next agent
- Dev servers: frontend :5173 (vite), backend :8000 (uvicorn --reload), both
  started from background cmd processes; logs in `.playwright-mcp/`.
- The demo key `hawk_F5I...` lives ONLY in `scripts/seed_demo_data.py`.
- Frontend typechecks MUST use `-p tsconfig.app.json`.
- Deep-link contract and status vocabularies unchanged (see AGENTS.md).
- Theme storage key is `theme` (values: light | dark | black); the inline
  boot script in index.html must stay in sync with ThemeProvider.
- `.playwright-mcp/*.cjs` are QA scripts (Playwright via the temp node_modules);
  `make_og.py` regenerates `frontend/public/og-image.png`.
