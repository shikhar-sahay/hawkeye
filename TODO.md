# HawkEye v2 TODO

## High Priority (Blocking MVP)
- [ ] **Fix alerts.py N+1 query bug** - In `list_alerts`, the count query uses `stmt.subquery()` which doesn't work correctly with joins
- [ ] **Fix bot detector async issues** - Bot detector methods return coroutines not alerts; detection engine doesn't await properly
- [ ] **Fix detection engine** - Need to await detector.detect() properly, bot detector returns list of coroutines
- [ ] **Run all tests and ensure pass** - `pytest tests/ -v` should pass 100%

## Medium Priority (MVP Backend Completion)
- [ ] Add WebSocket support to FastAPI app
- [ ] Implement real-time alert broadcast via WebSocket
- [ ] Implement real-time incident broadcast via WebSocket
- [ ] Add WebSocket authentication (API key or JWT)
- [ ] Add connection health/heartbeat mechanism
- [ ] Create WebSocket connection manager

## Low Priority (Post-MVP)
- [ ] Frontend dashboard (React + TypeScript + Vite)
- [ ] Browser security agent (Chrome extension)
- [ ] Flask/FastAPI/Express SDKs
- [ ] Attack Replay feature
- [ ] Comprehensive documentation
- [ ] Docker/Kubernetes deployment configs
- [ ] Alembic migrations for production

## Blockers
- [ ] **Bug in alerts.py list_alerts count query** - blocks API testing
- [ ] **Bot detector async/await issues** - blocks detection engine tests

## Bugs Found (Non-blocking, add to TODO)
- BotDetector._check_automation_patterns references undefined `alerts` list (line 113 in bot.py)
- BotDetector._check_user_agent has duplicate return statement (lines 167-177 in bot.py)
- DetectionContext time_window_start uses settings.correlation_time_window_hours but should use detection-specific window

---

## Done
- [x] Project structure & FastAPI bootstrap
- [x] Configuration (Pydantic Settings)
- [x] Database (SQLModel + async SQLite/PostgreSQL)
- [x] Event ingestion API (/api/v1/events/ingest)
- [x] Batch ingestion API
- [x] Normalization engine with MITRE ATT&CK tagging
- [x] 7 Detection engines: brute_force, credential_stuffing, enumeration, bot_detection, sensitive_actions, session_hijacking, api_abuse
- [x] Correlation engine for incident creation
- [x] Alerts API (list, get, stats, update status)
- [x] Incidents API (list, get, stats, alerts, update status)
- [x] Source/API key management API
- [x] API key authentication (X-API-Key header)
- [x] Basic test suite (ingestion, detection, normalization)