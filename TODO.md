# HawkEye v2 Engineering Backlog

## Task Format
Each task has:
- **Priority**: P0 (Blocker) | P1 (High) | P2 (Medium) | P3 (Low)
- **Completion Criteria**: Measurable definition of done
- **Dependencies**: Task IDs that must complete first

---

## P0 - Blockers (Must Fix Before MVP) ✅ ALL COMPLETE

### T-001: Fix BotDetector `_check_automation_patterns` undefined variable ✅ DONE
- **File**: `hawkeye/services/detection/bot.py` (line ~113)
- **Issue**: References undefined `alerts` list variable
- **Resolution**: Code review shows issue was already fixed in commit 13ed3a2 — `alerts` properly initialized and used in `detect()` method
- **Dependencies**: None
- **Verified**: All tests pass

### T-002: Fix BotDetector `_analyze_user_agent` duplicate return ✅ DONE
- **File**: `hawkeye/services/detection/bot.py` (lines 167-177)
- **Issue**: Duplicate return statement (unreachable code)
- **Resolution**: Code review shows single return at end of method — already fixed in commit 13ed3a2
- **Dependencies**: None
- **Verified**: All tests pass

### T-003: Fix DetectionContext `time_window_start` uses wrong config ✅ DONE
- **File**: `hawkeye/services/detection/base.py` (DetectionContext class)
- **Issue**: Uses `settings.correlation_time_window_hours` but should use detection-specific window
- **Resolution**: 
  - Added `detection_time_window_minutes = 60` to `hawkeye/config.py`
  - Updated `DetectionContext.__post_init__` to use detection window
- **Dependencies**: None
- **Verified**: All tests pass; DetectionContext now defaults to 60-minute window

### T-004: Verify all tests pass (pytest 100% green) ✅ DONE
- **Command**: `pytest tests/ -v`
- **Result**: 18/18 tests pass
- **Dependencies**: T-001, T-002, T-003
- **Verified**: Complete

---

## P1 - High Priority (MVP Backend Completion)

### T-010: Add WebSocket support to FastAPI app
- **Files**: `hawkeye/main.py`, new `hawkeye/api/websocket.py`
- **Completion Criteria**: WebSocket endpoint `/ws` accepts connections; connection manager handles multiple clients
- **Dependencies**: T-004 (tests pass)
- **Estimated Effort**: 2 hours

### T-011: Implement real-time alert broadcast via WebSocket
- **Files**: `hawkeye/api/websocket.py`, `hawkeye/services/detection/engine.py`
- **Completion Criteria**: When alert created, all connected WS clients receive JSON alert payload
- **Dependencies**: T-010
- **Estimated Effort**: 1.5 hours

### T-012: Implement real-time incident broadcast via WebSocket
- **Files**: `hawkeye/api/websocket.py`, `hawkeye/services/correlation/engine.py`
- **Completion Criteria**: When incident created/updated, all connected WS clients receive JSON incident payload
- **Dependencies**: T-010
- **Estimated Effort**: 1 hour

### T-013: Add WebSocket authentication (API key or JWT)
- **Files**: `hawkeye/api/websocket.py`, `hawkeye/api/deps.py`
- **Completion Criteria**: WS connection requires valid API key; rejects unauthorized connections
- **Dependencies**: T-010
- **Estimated Effort**: 1 hour

### T-014: Add WebSocket connection health/heartbeat
- **Files**: `hawkeye/api/websocket.py`
- **Completion Criteria**: Ping/pong every 30s; auto-disconnect stale connections; connection count endpoint
- **Dependencies**: T-010
- **Estimated Effort**: 45 min

### T-015: Create WebSocket connection manager
- **Files**: `hawkeye/api/websocket.py` (or new `hawkeye/services/ws_manager.py`)
- **Completion Criteria**: Centralized manager handles connect/disconnect/broadcast; tracks connections per source
- **Dependencies**: T-010
- **Estimated Effort**: 45 min

---

## P2 - Medium Priority (Post-MVP Backend)

### T-020: Frontend Dashboard - React + TypeScript + Vite setup
- **Files**: New `frontend/` directory
- **Completion Criteria**: `npm run dev` starts Vite; TypeScript compiles; ESLint/Prettier configured
- **Dependencies**: T-014 (WebSocket backend complete)
- **Estimated Effort**: 4 hours

### T-021: Frontend - Tailwind CSS + shadcn/ui components
- **Files**: `frontend/src/components/`
- **Completion Criteria**: Button, Card, Table, Badge, Alert, Dialog components available
- **Dependencies**: T-020
- **Estimated Effort**: 2 hours

### T-022: Frontend - Real-time alert feed (WebSocket)
- **Files**: `frontend/src/hooks/useWebSocket.ts`, `frontend/src/components/AlertFeed.tsx`
- **Completion Criteria**: Alerts appear in real-time; auto-scroll; filter by severity
- **Dependencies**: T-020, T-011
- **Estimated Effort**: 3 hours

### T-023: Frontend - Incident timeline view
- **Files**: `frontend/src/components/IncidentTimeline.tsx`
- **Completion Criteria**: Visual timeline showing correlated alerts; click for detail
- **Dependencies**: T-020, T-012
- **Estimated Effort**: 3 hours

### T-024: Frontend - Alert/Incident detail views
- **Files**: `frontend/src/components/AlertDetail.tsx`, `frontend/src/components/IncidentDetail.tsx`
- **Completion Criteria**: Modal/drawer with full evidence, MITRE tags, related events
- **Dependencies**: T-020
- **Estimated Effort**: 2 hours

### T-025: Frontend - Statistics dashboard with charts
- **Files**: `frontend/src/components/StatsDashboard.tsx`, `frontend/src/components/charts/`
- **Completion Criteria**: Alerts over time, by severity, by detector, by source; uses Recharts or similar
- **Dependencies**: T-020
- **Estimated Effort**: 3 hours

### T-026: Frontend - Source/API key management UI
- **Files**: `frontend/src/components/SourceManager.tsx`
- **Completion Criteria**: Create/edit/delete sources; generate/revoke API keys; copy to clipboard
- **Dependencies**: T-020
- **Estimated Effort**: 2 hours

### T-027: Frontend - Dark/light theme
- **Files**: `frontend/src/styles/theme.css`, `frontend/src/hooks/useTheme.ts`
- **Completion Criteria**: Toggle persists in localStorage; all components respect theme
- **Dependencies**: T-020
- **Estimated Effort**: 1 hour

---

## P3 - Low Priority (Post-MVP Features)

### T-030: Browser Security Agent - Chrome Extension (Manifest V3)
- **Files**: New `browser-agent/` directory
- **Completion Criteria**: Extension loads in Chrome; content script injects; background service worker runs
- **Dependencies**: T-027 (Frontend complete)
- **Estimated Effort**: 8 hours

### T-031: Browser Agent - CSP violation detection
- **Files**: `browser-agent/src/content/csp.ts`
- **Completion Criteria**: Reports CSP violations to HawkEye API with event metadata
- **Dependencies**: T-030
- **Estimated Effort**: 3 hours

### T-032: Browser Agent - DOM integrity monitoring
- **Files**: `browser-agent/src/content/dom.ts`
- **Completion Criteria**: Detects script injection, iframe injection, form hijacking
- **Dependencies**: T-030
- **Estimated Effort**: 4 hours

### T-033: Browser Agent - Bot/automation detection
- **Files**: `browser-agent/src/content/bot.ts`
- **Completion Criteria**: Detects Selenium, Puppeteer, Playwright; reports to API
- **Dependencies**: T-030
- **Estimated Effort**: 3 hours

### T-034: Browser Agent - Event batching & send
- **Files**: `browser-agent/src/background/batch.ts`
- **Completion Criteria**: Batches events (max 50 or 5s); retries on failure; exponential backoff
- **Dependencies**: T-030
- **Estimated Effort**: 2 hours

### T-035: Browser Agent - CSP Reporting integration
- **Files**: `browser-agent/src/background/csp-report.ts`
- **Completion Criteria**: Registers `report-uri` CSP directive; forwards reports to HawkEye
- **Dependencies**: T-030
- **Estimated Effort**: 2 hours

### T-040: Flask/FastAPI/Express SDKs
- **Files**: New `sdks/` directory
- **Completion Criteria**: Middleware for each framework; auto-instruments requests; sends to HawkEye API
- **Dependencies**: T-027
- **Estimated Effort**: 6 hours

### T-050: Attack Replay Engine
- **Files**: New `hawkeye/services/replay/`
- **Completion Criteria**: Replays captured attack sequences; parameterizes payloads; generates report
- **Dependencies**: T-027
- **Estimated Effort**: 8 hours

### T-060: Docker/Kubernetes Deployment Configs
- **Files**: `Dockerfile`, `docker-compose.yml`, `k8s/`
- **Completion Criteria**: Multi-stage Dockerfile; compose for dev; K8s manifests for prod
- **Dependencies**: T-004
- **Estimated Effort**: 4 hours

### T-061: Alembic Migrations for Production
- **Files**: `alembic/`
- **Completion Criteria**: Auto-generates migrations; runs on startup; rollback supported
- **Dependencies**: T-004
- **Estimated Effort**: 2 hours

### T-062: Comprehensive Documentation
- **Files**: `docs/`, OpenAPI spec
- **Completion Criteria**: Architecture doc; API reference; integration guides; deployment guide
- **Dependencies**: T-027
- **Estimated Effort**: 6 hours

---

## Dependency Graph Summary

```
P0 Blockers:
T-001 ──┐
T-002 ──┼──→ T-004 (All Tests Pass)
T-003 ──┘
            │
            ▼
P1 MVP Backend:
T-010 ──┬──→ T-011 ──┐
T-010 ──┼──→ T-012 ──┤
T-010 ──┼──→ T-013 ──┼──→ P2 Frontend
T-010 ──┼──→ T-014 ──┤
T-010 ──┴──→ T-015 ──┘
                │
                ▼
            P2 Frontend:
T-020 ──┬──→ T-021 ──┐
T-020 ──┼──→ T-022 ──┤
T-020 ──┼──→ T-023 ──┤
T-020 ──┼──→ T-024 ──┼──→ P3 Features
T-020 ──┼──→ T-025 ──┤
T-020 ──┼──→ T-026 ──┤
T-020 ──┴──→ T-027 ──┘
                │
                ▼
            P3 Post-MVP:
T-030 → T-031..T-035 (Browser Agent)
T-040 (SDKs)
T-050 (Attack Replay)
T-060..T-062 (Ops & Docs)
```

---

## Current Sprint Focus
**Sprint Goal**: Complete P0 Blockers → Run All Tests → Begin WebSocket Implementation (T-010)

**Next Task to Start**: T-001 (BotDetector undefined variable fix)