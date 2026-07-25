# HawkEye v2 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-07-25 - Integration Blockers Resolved, Backend Production-Ready

### Fixed
- **T-030**: Fixed double route prefix on ingestion endpoints
  - Removed `prefix="/events"` from `hawkeye/api/v1/ingestion.py` router
  - Endpoints now correctly resolve to `/api/v1/events/ingest` and `/api/v1/events/ingest/batch`

- **T-031**: Fixed double route prefix on events query endpoints
  - Removed `prefix="/events"` from `hawkeye/api/v1/events.py` router
  - Endpoints now correctly resolve to `/api/v1/events/query` and `/api/v1/events/{event_id}`

- **T-032**: Added WebSocket header/cookie authentication
  - Modified `get_ws_source` in `hawkeye/api/websocket.py` to support multiple auth methods (priority order):
    1. `Authorization: Bearer <api_key>` header
    2. `X-API-Key: <api_key>` header
    3. Query parameter: `?api_key=<api_key>` (backward compatibility)
  - Frontend can now securely authenticate without exposing API keys in URLs/logs

- **T-033**: Implemented WebSocket reconnection protocol
  - Added `SessionData` class for session persistence with message history (max 1000 messages)
  - Added `ConnectionManager.reconnect()` method for full reconnection with missed message replay
  - Added `ConnectionManager.resume_session()` for session resumption on existing connection
  - Client protocol: `{"type": "reconnect", "data": {"session_id": "...", "last_event_id": 123}}`
  - Server responds with `connected` confirmation + replays all messages with `event_id > last_event_id`
  - Session TTL: 1 hour (configurable), auto-cleanup in heartbeat loop

### Changed
- Updated `ConnectionInfo` dataclass with `session_id` and `last_event_id` fields for reconnection support
- Heartbeat loop now cleans up expired sessions in addition to stale connections
- WebSocket `/ws` endpoint docstring updated with full protocol documentation including reconnection

### Verified
- All 33 tests pass (18 detection/ingestion + 11 WebSocket + 4 event query)
- WebSocket auth works via Bearer header, X-API-Key header, and query param (tested)
- Connection statistics endpoint `/ws/stats` returns accurate counts
- Subscription filtering works for alerts and incidents independently
- Multi-source isolation verified (source A cannot see source B alerts)
- Ruff linting clean on all modified files

---

## [2.0.1] - 2026-07-24 - Integration & QA Audit Complete

### Audit Summary
**Backend Completeness:** 95% | **Production Readiness:** 80% | **Frontend Readiness:** 65%

### Critical Blockers Identified (Must Fix Before Frontend)
| ID | Issue | File(s) | Severity | Status |
|----|-------|---------|----------|--------|
| B-01 | Double route prefix: `/api/v1/events/events/ingest` | `hawkeye/api/v1/ingestion.py`, `hawkeye/api/v1/__init__.py` | 🔴 CRITICAL | ✅ Fixed in 2.1.0 |
| B-02 | Double route prefix: `/api/v1/events/events/query` | `hawkeye/api/v1/events.py`, `hawkeye/api/v1/__init__.py` | 🔴 CRITICAL | ✅ Fixed in 2.1.0 |
| B-03 | WebSocket auth only via query param (`?api_key=`) — exposes keys in logs | `hawkeye/api/websocket.py` | 🔴 CRITICAL | ✅ Fixed in 2.1.0 |
| B-04 | No WebSocket reconnection protocol — disconnect = permanent loss | `hawkeye/api/websocket.py` | 🔴 CRITICAL | ✅ Fixed in 2.1.0 |

### Important Improvements (Planned)
| ID | Issue | File(s) |
|----|-------|---------|
| I-01 | Inconsistent error response shapes across endpoints | `hawkeye/api/v1/*.py` |
| I-02 | Incident list filters `affected_ip`, `affected_user` are stubs (no-op) | `hawkeye/api/v1/incidents.py:94-99` |
| I-03 | No request ID / correlation ID propagation | `hawkeye/api/deps.py` |
| I-04 | DetectionContext loads ALL recent events (1000 limit) — memory risk | `hawkeye/services/detection/base.py:95` |
| I-05 | Correlation engine loads all incident alerts into memory for scoring | `hawkeye/services/correlation/engine.py:70-82` |
| I-06 | WebSocket heartbeat doesn't send connection_id to client on ping | `hawkeye/api/websocket.py:348` |

### Nice-to-Have
| ID | Improvement | File(s) |
|----|-------------|---------|
| N-01 | Add OpenAPI descriptions for all WebSocket message types | `hawkeye/api/websocket.py` |
| N-02 | Standardize pagination response envelope across all list endpoints | `hawkeye/schemas/*.py` |
| N-03 | Add database indexes for Incident JSON fields (affected_ips, etc.) | `hawkeye/models/events.py` |
| N-04 | Extract DetectionEngine broadcast logic to separate service | `hawkeye/services/detection/engine.py` |
| N-05 | Add structured logging with correlation IDs | `hawkeye/main.py`, `hawkeye/api/deps.py` |

### Test Coverage Gaps (Integration Tests Needed)
- [ ] Event ingestion → detection → correlation → WebSocket broadcast (full pipeline)
- [ ] WebSocket auth + reconnect + missed message replay
- [ ] API key rotation + expiry + revocation flow
- [ ] Multi-source isolation (source A cannot see source B alerts)
- [ ] Correlation engine auto-close + reopen scenarios

---

## [2.0.0] - 2026-07-24 - Backend MVP + WebSocket Backend Complete

### Added
- **WebSocket API** (`hawkeye/api/websocket.py`) ✨ **NEW IN THIS RELEASE**
  - `ConnectionManager` class — Centralized WebSocket connection management
    - Multi-client support with per-source isolation
    - Subscription-based filtering (`alerts`, `incidents`)
    - Thread-safe connection tracking with asyncio locks
    - Automatic cleanup of failed/stale connections
  - WebSocket endpoint `/ws` with API key authentication
    - Query parameter: `api_key` (required)
    - Query parameter: `subscribe` — comma-separated: `alerts,incidents`
    - Returns connection confirmation with `connection_id`, `source_id`, `source_name`, `subscriptions`
  - Client message protocol:
    - `{"type": "pong"}` — Heartbeat response
    - `{"type": "subscribe", "data": {"types": ["alerts", "incidents"]}}`
    - `{"type": "unsubscribe", "data": {"types": ["alerts"]}}`
    - `{"type": "ping"}` — Request server pong
  - Server message protocol:
    - `{"type": "connected", "data": {...}}` — Connection confirmation
    - `{"type": "alert", "data": {...}}` — New alert notification
    - `{"type": "incident", "data": {...}}` — New/updated incident notification
    - `{"type": "ping", "timestamp": "..."}` — Server heartbeat
    - `{"type": "pong", "timestamp": "..."}` — Server pong response
    - `{"type": "error", "data": {...}}` — Error notification
  - Broadcast methods:
    - `broadcast_alert(alert_data, source_id)` — Send alert to subscribed connections
    - `broadcast_incident(incident_data, source_id)` — Send incident to subscribed connections
    - `broadcast_custom(message_type, data, source_id)` — Custom message type
  - Heartbeat/ping-pong every 30 seconds (configurable via `frontend_ws_heartbeat_seconds`)
  - Stale connection detection (2x heartbeat interval) with automatic cleanup
  - `/ws/stats` endpoint — Returns connection count, per-source breakdown, heartbeat interval
  - Lifecycle integration in `main.py` — Auto-starts/stops with app lifespan

- **Detection Engine** — Real-time alert broadcast via WebSocket
  - `DetectionEngine._broadcast_alert()` sends alerts to ConnectionManager immediately on creation

- **Correlation Engine** — Real-time incident broadcast via WebSocket
  - `CorrelationEngine._broadcast_incident()` sends incidents to ConnectionManager on create/update

### Changed
- Fixed duplicate import in `hawkeye/main.py:10` (was importing `router as ws_router` twice)

### Fixed
- **T-003**: DetectionContext now uses detection-specific time window (60 min default) instead of correlation window (24 hours)
  - Added `detection_time_window_minutes` setting in `hawkeye/config.py`
  - Updated `DetectionContext.__post_init__` in `hawkeye/services/detection/base.py`
- **T-001/T-002**: Verified BotDetector fixes from commit 13ed3a2 — no undefined variables or duplicate returns
- All 29 unit tests pass (pytest 100% green)

---

## [1.0.0] - 2026-07-20 - Backend MVP In Progress

Previous Flask-based implementation - not maintained.

---

## Upcoming Releases

### [2.2.0] - Target: After Frontend MVP (Milestone 3)
- React + TypeScript + Vite frontend
- Real-time alert feed with WebSocket
- Incident timeline visualization
- Alert/Incident detail views
- Statistics dashboard with charts
- Source/API key management UI
- Dark/light theme

### [3.0.0] - Target: After Milestone 4
- Browser Security Agent (Chrome MV3 extension)
- CSP violation detection
- DOM integrity monitoring
- Bot/automation detection
- Event batching & delivery

### [4.0.0] - Target: After Milestone 5
- SDK Integrations (Flask, FastAPI, Express)
- Python SDK for direct API usage
- Framework-agnostic client library

### [5.0.0] - Target: After Milestone 6
- Attack Replay Engine
- Replay API endpoints
- Replay UI in dashboard
- Comprehensive API documentation (OpenAPI)
- Deployment guides (Docker, Kubernetes)
- Architecture documentation
- Integration guides