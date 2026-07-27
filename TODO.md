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
- **Result**: 18/18 tests pass (original) → **33/33 tests pass** (with WebSocket)
- **Dependencies**: T-001, T-002, T-003
- **Verified**: Complete

---

## P0 - Integration Audit Blockers ✅ ALL COMPLETE

### T-030: Fix Double Route Prefix — Ingestion Endpoints ✅ DONE
- **File**: `hawkeye/api/v1/ingestion.py` (remove `prefix="/events"` from router)
- **Issue**: Endpoints resolve to `/api/v1/events/events/ingest` instead of `/api/v1/events/ingest`
- **Dependencies**: None
- **Completion Criteria**: `POST /api/v1/events/ingest` returns 202, `GET /api/v1/events/ingest` returns 405
- **Estimated Effort**: 10 minutes
- **Completed**: 2026-07-24

### T-031: Fix Double Route Prefix — Events Query Endpoints ✅ DONE
- **File**: `hawkeye/api/v1/events.py` (remove `prefix="/events"` from router)
- **Issue**: Endpoints resolve to `/api/v1/events/events/query` instead of `/api/v1/events/query`
- **Dependencies**: None
- **Completion Criteria**: `GET /api/v1/events/query` returns 200 with valid response
- **Estimated Effort**: 10 minutes
- **Completed**: 2026-07-24

### T-032: Add Header/Cookie Auth to WebSocket (`get_ws_source`) ✅ DONE
- **File**: `hawkeye/api/websocket.py` (get_ws_source function)
- **Issue**: WebSocket auth only supports query param (`?api_key=`) — exposes keys in logs
- **Dependencies**: None
- **Completion Criteria**:
  - `Authorization: Bearer <key>` header works (priority 1)
  - `X-API-Key: <key>` header works (priority 2)
  - `?api_key=<key>` query param still works for backward compatibility (priority 3)
  - Priority order enforced: Bearer > X-API-Key > Query
- **Estimated Effort**: 20 minutes
- **Completed**: 2026-07-24

### T-033: Implement WebSocket Reconnection Protocol ✅ DONE
- **File**: `hawkeye/api/websocket.py` (ConnectionManager + endpoint handlers)
- **Issue**: No WebSocket reconnection protocol — disconnect = permanent loss
- **Dependencies**: T-032 (auth must work for reconnect)
- **Completion Criteria**:
  - Client can send `{"type": "reconnect", "data": {"session_id": "...", "last_event_id": N}}`
  - Server validates session_id exists and not expired (1hr TTL)
  - Server replays missed messages (event_id > last_event_id)
  - ConnectionManager stores session data with message history (max 1000 msgs)
  - New connection_id issued, same session_id preserved
- **Estimated Effort**: 60 minutes
- **Completed**: 2026-07-24

---

## P1 - Milestone 2: WebSocket Backend ✅ ALL COMPLETE

### T-010: WebSocket endpoint `/ws` in FastAPI app with lifespan ✅ DONE
- **Files**: `hawkeye/main.py`, `hawkeye/api/websocket.py`
- **Completion Criteria**: WebSocket endpoint registered, lifespan starts/stops ConnectionManager
- **Completed**: 2026-07-24

### T-011: Real-time alert broadcast via DetectionEngine ✅ DONE
- **File**: `hawkeye/services/detection/engine.py` (_broadcast_alert method)
- **Completion Criteria**: Alerts broadcast to ConnectionManager immediately on creation
- **Completed**: 2026-07-24

### T-012: Real-time incident broadcast via CorrelationEngine ✅ DONE
- **File**: `hawkeye/services/correlation/engine.py` (_broadcast_incident method)
- **Completion Criteria**: Incidents broadcast to ConnectionManager on create/update
- **Completed**: 2026-07-24

### T-013: WebSocket authentication via API key ✅ DONE (Enhanced in T-032)
- **File**: `hawkeye/api/websocket.py` (get_ws_source)
- **Completion Criteria**: Multiple auth methods supported with priority order
- **Completed**: 2026-07-24

### T-014: Heartbeat/ping-pong + stats endpoint ✅ DONE
- **File**: `hawkeye/api/websocket.py` (ConnectionManager._heartbeat_loop, /ws/stats)
- **Completion Criteria**: 30s ping/pong, stale cleanup, /ws/stats returns counts
- **Completed**: 2026-07-24

### T-015: ConnectionManager class with subscriptions ✅ DONE
- **File**: `hawkeye/api/websocket.py` (ConnectionManager class)
- **Completion Criteria**: connect/disconnect/broadcast, per-source isolation, subscriptions
- **Completed**: 2026-07-24

---

## P1 - Milestone 3: Frontend Dashboard 🟢 IN PROGRESS

### T-020: Frontend Setup — React + TypeScript + Vite ✅ COMPLETE
- **Files**: `frontend/` (new directory)
- **Dependencies**: T-010 through T-015, T-030 through T-033 (ALL COMPLETE)
- **Completion Criteria**:
  - `npm create vite@latest frontend -- --template react-ts` ✅
  - Tailwind CSS configured ✅
  - shadcn/ui initialized ✅
  - ESLint + Prettier configured ✅
  - Dev server runs (`npm run dev`) ✅
  - TypeScript strict mode enabled ✅
- **Estimated Effort**: 2-3 hours
- **Completed**: 2026-07-25

### T-021: Tailwind + shadcn/ui Components ✅ COMPLETE
- **Files**: `frontend/src/components/ui/`
- **Dependencies**: T-020
- **Completion Criteria**:
  - Core components: Button, Card, Table, Badge, Avatar, Dropdown, Toast, Tabs, Dialog, ScrollArea, Separator, Label, Input, Select, Switch, Tooltip ✅
  - Dark/light theme provider working ✅
  - Components follow shadcn/ui patterns ✅
- **Completed**: 2026-07-25

### T-022: Real-time Alert Feed (WebSocket) ✅ COMPLETE
- **Files**: `frontend/src/hooks/useWebSocket.ts`, `frontend/src/components/AlertFeed.tsx`, `frontend/src/pages/Alerts.tsx`
- **Dependencies**: T-020, T-021
- **Completion Criteria**:
  - WebSocket hook connects to `/ws` with API key ✅
  - Auto-reconnect on disconnect (uses reconnection protocol) ✅
  - AlertFeed component displays real-time alerts with severity badges ✅
  - Subscribe/unsubscribe to alert types ✅
  - Shows connection status indicator ✅
- **Estimated Effort**: 3-4 hours
- **Completed**: 2026-07-27

### T-023: Incident Timeline View ✅ COMPLETE
- **Files**: `frontend/src/components/IncidentTimeline.tsx`, `frontend/src/pages/Incidents.tsx`
- **Dependencies**: T-020, T-021
- **Completion Criteria**:
  - Timeline visualization of incidents with MITRE tactics ✅
  - Click to expand incident details ✅
  - Filter by status, severity, time range ✅
  - Real-time updates via WebSocket incident subscription ✅
- **Estimated Effort**: 3-4 hours
- **Completed**: 2026-07-27

### T-024: Alert/Incident Detail Views ✅ COMPLETE
- **Files**: `frontend/src/components/AlertDetail.tsx`, `frontend/src/components/IncidentDetail.tsx`
- **Dependencies**: T-020, T-021
- **Completion Criteria**:
  - Modal/drawer views for alert and incident details ✅
  - Shows evidence, MITRE tags, affected entities, confidence ✅
  - Status update actions (acknowledge, resolve, suppress) ✅
  - Related events/alerts list ✅
- **Estimated Effort**: 3-4 hours
- **Status**: ✅ COMPLETE — 2026-07-27

### T-025: Statistics Dashboard with Charts ✅ COMPLETE
- **Files**: `frontend/src/components/StatsDashboard.tsx`, `frontend/src/components/charts/`
- **Dependencies**: T-020, T-021
- **Completion Criteria**:
  - Overview cards: total alerts, open incidents, critical severity, sources ✅
  - Time-series chart: alerts over time (last 24h, 7d, 30d) ✅
  - Pie chart: alerts by severity ✅
  - Bar chart: alerts by detection type ✅
  - MITRE tactics heatmap ✅
  - Data fetched via REST API, updates via WebSocket ✅
- **Estimated Effort**: 4-5 hours
- **Status**: ✅ COMPLETE — 2026-07-27

**Charts Implemented**:
- `AlertsOverTimeChart.tsx` — Time-series area chart with gradient fill
- `SeverityDistributionChart.tsx` — Donut chart (Critical/High/Medium/Low)
- `DetectionTypeChart.tsx` — Vertical/horizontal bar chart (7 detection types)
- `MITRECoverageChart.tsx` — Horizontal bar chart (14 MITRE tactics)
- `EventsBySourceChart.tsx` — Stacked horizontal bar (events/alerts/incidents by source)
- `RecentActivityPanel.tsx` — Summary cards with icons and counts

### T-026: Source/API Key Management UI
- **Files**: `frontend/src/components/SourceManager.tsx`, `frontend/src/pages/Settings.tsx`
- **Dependencies**: T-020, T-021
- **Completion Criteria**:
  - List sources with status, event counts
  - Create/edit/delete sources
  - Generate/revoke/rotate API keys
  - Copy API key to clipboard
  - Key expiry management
- **Estimated Effort**: 3-4 hours
- **Status**: ⏳ PENDING — **NEXT TASK**

### T-027: Dark/Light Theme 🟢 PARTIAL
- **Files**: `frontend/src/components/ThemeToggle.tsx`, `frontend/src/components/layout/TopNav.tsx`
- **Dependencies**: T-020, T-021
- **Completion Criteria**:
  - System preference detection ✅
  - Manual toggle in header 🟢 NEEDS INTEGRATION IN TOPNAV
  - Persists to localStorage ✅
  - All components respect theme ✅
- **Estimated Effort**: 1 hour
- **Status**: 🟢 PARTIAL (ThemeProvider done, toggle needs TopNav integration)

---

## P2 - Milestone 4: Browser Security Agent (Planned)

### T-040: Chrome MV3 Extension Scaffold
### T-041: Content Script for DOM Monitoring
### T-042: CSP Violation Detection & Reporting
### T-043: DOM Integrity Monitoring
### T-044: Bot/Automation Detection (Client-side)
### T-045: Event Batching & Batch Send to API
### T-046: CSP Reporting Endpoint Integration

---

## P2 - Milestone 5: SDK Integrations (Planned)

### T-050: Flask Middleware SDK
### T-051: FastAPI Middleware SDK
### T-052: Express.js Middleware SDK
### T-053: Python SDK (Direct API Client)
### T-054: Framework-Agnostic Client Library

---

## P2 - Milestone 6: Attack Replay & Documentation (Planned)

### T-060: Attack Replay Engine
### T-061: Replay API Endpoints
### T-062: Replay UI in Dashboard
### T-063: Comprehensive API Documentation (OpenAPI)
### T-064: Deployment Guides (Docker, K8s)
### T-065: Architecture Documentation
### T-066: Integration Guides

---

## Completed Tasks Summary

| Task | Description | Completed |
|------|-------------|-----------|
| T-001 | BotDetector undefined variable | 2026-07-20 (commit 13ed3a2) |
| T-002 | BotDetector duplicate return | 2026-07-20 (commit 13ed3a2) |
| T-003 | DetectionContext time window | 2026-07-24 |
| T-004 | All tests pass | 2026-07-24 |
| T-010 | WebSocket endpoint + lifespan | 2026-07-24 |
| T-011 | Alert broadcast | 2026-07-24 |
| T-012 | Incident broadcast | 2026-07-24 |
| T-013 | WebSocket auth (query param) | 2026-07-24 |
| T-014 | Heartbeat + stats | 2026-07-24 |
| T-015 | ConnectionManager | 2026-07-24 |
| T-020 | Frontend Setup (React+TS+Vite) | 2026-07-25 |
| T-021 | Tailwind + shadcn/ui Components | 2026-07-25 |
| T-022 | Real-time Alert Feed (WebSocket) | 2026-07-27 |
| T-023 | Incident Timeline View | 2026-07-27 |
| T-024 | Alert/Incident Detail Views | 2026-07-27 |
| T-025 | Statistics Dashboard with Charts | 2026-07-27 |
| T-030 | Fix ingestion route prefix | 2026-07-24 |
| T-031 | Fix events route prefix | 2026-07-24 |
| T-032 | WebSocket header auth | 2026-07-24 |
| T-033 | WebSocket reconnection | 2026-07-24 |

**Total Completed: 22 tasks**
**Next Active: T-026 (Source/API Key Management UI)**