# HawkEye v2 Roadmap

## Overall Project Goal
Build a production-ready Web Application Security Monitoring Platform (SIEM) with real-time dashboard, WebSocket updates, browser security agent, and SDK integrations.

## Major Milestones

### Milestone 1: Backend MVP (CURRENT - In Progress)
**Status: ~85% Complete**
- [x] Event ingestion API (REST)
- [x] Event normalization engine
- [x] Detection engine with 7 detectors
- [x] Correlation engine for incident creation
- [x] Alerts API (list, stats, get, update)
- [x] Incidents API (list, stats, get, alerts, update status)
- [x] API key authentication & source management
- [x] SQLite/PostgreSQL database with SQLModel
- [ ] **Fix known alerts.py bug** (IN PROGRESS)
- [ ] Fix bot detector async issues in detection engine
- [ ] Run all tests and ensure they pass

### Milestone 2: Real-time Dashboard Backend
**Status: 0% Complete**
- [ ] WebSocket server implementation
- [ ] Real-time alert/incident broadcast
- [ ] Connection management & auth
- [ ] WebSocket client reconnection logic
- [ ] Health & connection status endpoints

### Milestone 3: Frontend Dashboard
**Status: 0% Complete**
- [ ] React + TypeScript + Vite setup
- [ ] Tailwind CSS + shadcn/ui components
- [ ] Real-time alert feed (WebSocket)
- [ ] Incident timeline view
- [ ] Alert/incident detail views
- [ ] Statistics dashboard with charts
- [ ] Source/API key management UI
- [ ] Dark/light theme

### Milestone 4: Browser Security Agent
**Status: 0% Complete**
- [ ] Browser extension (Manifest V3)
- [ ] Content script for DOM monitoring
- [ ] CSP violation detection
- [ ] DOM integrity monitoring
- [ ] Bot/automation detection
- [ ] Event batching & batching send to HawkEye API
- [ ] Content Security Policy reporting integration

### Milestone 5: SDK Integrations
**Status: 0% Complete**
- [ ] Python/Flask SDK (middleware)
- [ ] FastAPI middleware
- [ ] Express.js/Node.js middleware
- [ ] Python SDK for direct API usage
- [ ] Framework-agnostic client library

### Milestone 6: Attack Replay & Documentation
**Status: 0% Complete**
- [ ] Attack replay engine
- [ ] Replay API endpoints
- [ ] Replay UI in dashboard
- [ ] Comprehensive API documentation (OpenAPI)
- [ ] Deployment guide (Docker, Kubernetes)
- [ ] Architecture documentation
- [ ] Integration guides

---

## Current Milestone: Backend MVP
**Target: Complete by 2026-07-27 (1 week from start)**

### Immediate Next Steps:
1. Fix the alerts.py bug (N+1 query in list_alerts)
2. Fix bot detector async issues in detection engine
3. Run and pass all existing tests

### Next Milestone After Current: Real-time Dashboard Backend (WebSockets)