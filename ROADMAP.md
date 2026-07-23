# HawkEye v2 Roadmap

## Overall Project Goal
Build a production-ready Web Application Security Monitoring Platform (SIEM) with real-time dashboard, WebSocket updates, browser security agent, and SDK integrations.

---

## Major Milestones

### Milestone 1: Backend MVP
**Target: 2026-07-27 (1 week from start)**
- Event ingestion API (REST)
- Event normalization engine with MITRE ATT&CK tagging
- Detection engine with 7 detectors
- Correlation engine for incident creation
- Alerts API (list, stats, get, update)
- Incidents API (list, stats, get, alerts, update status)
- API key authentication & source management
- SQLite/PostgreSQL database with SQLModel
- All tests passing

### Milestone 2: Real-time Dashboard Backend
**Target: TBD (after Milestone 1)**
- WebSocket server implementation
- Real-time alert/incident broadcast
- Connection management & auth
- WebSocket client reconnection logic
- Health & connection status endpoints

### Milestone 3: Frontend Dashboard
**Target: TBD (after Milestone 2)**
- React + TypeScript + Vite setup
- Tailwind CSS + shadcn/ui components
- Real-time alert feed (WebSocket)
- Incident timeline view
- Alert/incident detail views
- Statistics dashboard with charts
- Source/API key management UI
- Dark/light theme

### Milestone 4: Browser Security Agent
**Target: TBD (after Milestone 3)**
- Browser extension (Manifest V3)
- Content script for DOM monitoring
- CSP violation detection
- DOM integrity monitoring
- Bot/automation detection
- Event batching & batch send to HawkEye API
- CSP reporting integration

### Milestone 5: SDK Integrations
**Target: TBD (after Milestone 4)**
- Python/Flask SDK (middleware)
- FastAPI middleware
- Express.js/Node.js middleware
- Python SDK for direct API usage
- Framework-agnostic client library

### Milestone 6: Attack Replay & Documentation
**Target: TBD (after Milestone 5)**
- Attack replay engine
- Replay API endpoints
- Replay UI in dashboard
- Comprehensive API documentation (OpenAPI)
- Deployment guide (Docker, Kubernetes)
- Architecture documentation
- Integration guides

---

## Current Status
**Active Milestone: Milestone 1 - Backend MVP**
**Progress: ~90% Complete**

---

## Milestone Dependencies
```
Milestone 1 (Backend MVP) → Milestone 2 (WebSocket Backend)
    ↓
Milestone 2 (WebSocket Backend) → Milestone 3 (Frontend Dashboard)
    ↓
Milestone 3 (Frontend) → Milestone 4 (Browser Agent)
    ↓
Milestone 4 (Browser Agent) → Milestone 5 (SDKs)
    ↓
Milestone 5 (SDKs) → Milestone 6 (Attack Replay & Docs)
```