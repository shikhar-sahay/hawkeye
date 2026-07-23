# HawkEye v2 — Developer Handbook

This is the definitive operating manual for all Claude sessions working on HawkEye. A brand new session with zero prior context should be able to read **only this file and SESSION.md** and immediately continue productive development.

---

## 1. Project Overview

**What HawkEye is:** A web application security monitoring platform (SIEM-lite) that ingests security events from web applications, normalizes them with MITRE ATT&CK tags, runs 7 detection engines, correlates alerts into incidents, and exposes everything via REST APIs.

**Final Vision:** A production-ready, self-hostable security monitoring stack with:
- Real-time alert/incident dashboard (WebSocket + React)
- Browser security agent (Chrome extension MV3) for client-side telemetry
- Framework SDKs (Flask, FastAPI, Express) for automatic instrumentation
- Attack replay engine for incident investigation
- Optional PyPI package (`pip install hawkeye`)

**Intended Users:** Security engineers, DevSecOps teams, and developers who need application-layer visibility without enterprise SIEM complexity.

**Overall Architecture:**
```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Web Apps   │────▶│  HawkEye API     │────▶│  PostgreSQL  │
│  (SDKs)     │     │  (FastAPI)       │     │  (SQLModel)  │
└─────────────┘     └────────┬─────────┘     └──────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐ ┌─────────────┐ ┌────────────┐
       │ Ingestion  │ │ Detection   │ │ Correlation│
       │ Service    │ │ Engine (7x) │ │ Engine     │
       └────────────┘ └─────────────┘ └────────────┘
              │              │              │
              ▼              ▼              ▼
       ┌──────────────────────────────────────────┐
       │            REST + WebSocket API          │
       └──────────────────────────────────────────┘
              │              │              │
              ▼              ▼              ▼
       ┌────────────┐ ┌─────────────┐ ┌────────────┐
       │  Frontend  │ │  Browser    │ │   SDKs     │
       │  (React)   │ │  Agent      │ │ (Python/JS)│
       └────────────┘ └─────────────┘ └────────────┘
```

**"Production-Ready MVP" Definition (Milestone 1):**
- All 7 detectors functional and tested
- Alerts + Incidents REST APIs complete with filtering, stats, status updates
- API key authentication working
- SQLite (dev) / PostgreSQL (prod) via SQLModel
- 18+ unit tests passing
- Zero known P0 bugs

---

## 2. Repository Layout

```
Hawkeye/
├── hawkeye/              # Main backend package (FastAPI app)
│   ├── main.py           # App entry point, lifespan, CORS, health
│   ├── config.py         # Pydantic Settings (all env-configurable)
│   ├── database.py       # Async SQLModel engine, session management
│   ├── core/
│   │   ├── auth.py       # API key hashing, verification, generation
│   │   └── normalization.py  # Event normalization + MITRE mapping
│   ├── models/
│   │   ├── events.py     # SQLModel tables: Source, RawEvent, NormalizedEvent, Alert, Incident, IncidentAlert, ApiKey
│   │   └── enums.py      # Severity, DetectionType, AlertStatus, IncidentStatus
│   ├── schemas/          # Pydantic request/response models
│   ├── api/
│   │   ├── deps.py       # FastAPI dependencies (auth, session)
│   │   └── v1/           # REST endpoints (ingestion, events, sources, alerts, incidents)
│   └── services/
│       ├── ingestion_service.py
│       ├── detection/
│       │   ├── engine.py       # DetectionEngine orchestrates 7 detectors
│       │   ├── base.py         # BaseDetector, DetectionContext, Alert factory
│       │   ├── brute_force.py
│       │   ├── credential_stuffing.py
│       │   ├── enumeration.py
│       │   ├── bot.py
│       │   ├── sensitive_actions.py
│       │   ├── session_hijacking.py
│       │   └── api_abuse.py
│       └── correlation/
│           └── engine.py       # CorrelationEngine (time-window based)
├── frontend/             # React + TypeScript + Vite (Milestone 3 — NOT STARTED)
├── tests/                # Unit tests (pytest + pytest-asyncio)
│   ├── test_detection.py
│   └── test_ingestion.py
├── legacy-v1/            # ARCHIVED — Old Flask implementation, reference only
├── alembic/              # Database migrations (Milestone 6 — NOT STARTED)
├── pyproject.toml        # Build config, dependencies, ruff/mypy/pytest settings
├── CLAUDE.md             # THIS FILE — Developer handbook
├── SESSION.md            # Current session state (single active task)
├── TODO.md               # Engineering backlog (P0–P3 with IDs, deps, criteria)
├── CHANGELOG.md          # Completed work only, reverse chronological
└── ROADMAP.md            # Six milestones, progress %, dependencies
```

**Important:** `legacy-v1/` is archived reference code only. Do not modify or depend on it.

---

## 3. Current Architecture (Implemented)

- **Framework:** FastAPI (async, Python 3.11+)
- **Database:** SQLModel + SQLAlchemy 2.0 async — SQLite for dev, PostgreSQL for prod
- **Auth:** API keys with bcrypt hashing, X-API-Key header
- **Ingestion:** Single + batch endpoints → normalization → persistence → detection
- **Detection Engine:** `DetectionEngine.process_event()` runs 7 detectors sequentially:
  1. BruteForceDetector
  2. CredentialStuffingDetector
  3. EnumerationDetector
  4. BotDetector
  5. SensitiveActionDetector
  6. SessionHijackingDetector
  7. APIAbuseDetector
- **Correlation Engine:** Time-window based alert grouping → Incident creation + MITRE aggregation
- **REST APIs:** `/api/v1/events`, `/api/v1/sources`, `/api/v1/alerts`, `/api/v1/incidents`
- **Planned:** WebSocket layer (Milestone 2), React frontend (Milestone 3), SDKs (Milestone 5)

---

## 4. Long-Term Roadmap (6 Milestones)

| # | Milestone | Target | Status |
|---|-----------|--------|--------|
| 1 | **Backend MVP** | 2026-07-27 | ~90% — P0 bugs remain |
| 2 | **Real-time Dashboard Backend** | After M1 | 0% — WebSocket server + broadcasts |
| 3 | **Frontend Dashboard** | After M2 | 0% — React + TS + WebSocket client |
| 4 | **Browser Security Agent** | After M3 | 0% — Chrome MV3 extension |
| 5 | **SDK Integrations** | After M4 | 0% — Flask/FastAPI/Express |
| 6 | **Attack Replay & Docs** | After M5 | 0% — Replay engine + deployment |

Full details in `ROADMAP.md`. Do not duplicate here.

---

## 5. Current Development Status

- **Active Milestone:** 1 — Backend MVP (~90% complete)
- **What's Done:** All APIs, all 7 detectors, correlation engine, auth, database, 18 unit tests passing
- **What's Blocked:** 3 P0 bugs in `bot.py` and `base.py` (undefined variable, duplicate return, wrong time window config)
- **Source of Truth for Active Task:** `SESSION.md` — always contains exactly one current engineering task with status, files, verification commands, and handoff notes

---

## 6. Engineering Principles (MANDATORY)

1. **Repository is the source of truth** — Never rely on chat history. Always `Read` before `Edit`.
2. **Read order for every new session:**
   - `CLAUDE.md` (this handbook)
   - `SESSION.md` (current task)
   - `TODO.md` (backlog context)
   - `CHANGELOG.md` (only if needed)
   - `ROADMAP.md` (only for milestone context)
3. **Never redesign architecture** — Unless explicitly requested by the user.
4. **Exactly ONE active engineering task per session** — Complete it fully before starting another.
5. **Verify every implementation** — Run tests, lint, confirm expected behavior.
6. **Keep responses brief** — Concise, action-oriented. No essays.

---

## 7. Session Workflow

### Session Start
```
1. Read CLAUDE.md
2. Read SESSION.md (current task, status, blockers, verification commands)
3. Read TODO.md (confirm task exists, check dependencies)
4. Begin work on the single active task in SESSION.md
```

### During Implementation
- Modify only files relevant to the active task
- Run verification commands after each logical step
- Update `SESSION.md` with progress: status, verification results, next action

### Session Completion Checklist (MANDATORY — exact order)

□ **1. Verify the implementation** — Run all relevant tests; confirm they pass  
□ **2. Update SESSION.md** — Current status, verification results, next action, handoff notes  
□ **3. Update TODO.md** — Mark completed tasks; adjust dependencies if needed  
□ **4. Update CHANGELOG.md** — Add completed work under current version  
□ **5. Update ROADMAP.md** — Only if milestone progress % or status changed  
□ **6. Only then stop**

---

## 8. Documentation Rules

| File | Responsibility | Update Frequency |
|------|----------------|------------------|
| **CLAUDE.md** | Developer handbook — architecture, workflow, principles, roadmap summary | Only when workflow/architecture changes |
| **SESSION.md** | Single source of truth for current session — active task, status, blockers, verification, handoff | Every session |
| **TODO.md** | Engineering backlog — every task has ID, priority, dependencies, completion criteria | When tasks added/completed/blocked |
| **CHANGELOG.md** | Completed work only, reverse chronological, versioned | When features/fixes land |
| **ROADMAP.md** | Six milestones, progress %, dependencies | Only when milestone status changes |

**Each file has exactly one clear purpose. Do not duplicate content across files.**

---

## 9. Development Priorities

**Current Priority (Milestone 1):**
Finish Backend MVP — fix 3 P0 bugs → all tests pass → milestone complete.

**After Backend MVP (Milestone 2):**
Implement WebSocket backend — connection manager, alert/incident broadcasts, auth, heartbeat, health endpoints.

**After WebSocket Backend (Milestone 3):**
Build functional frontend — React + TS + Vite, real-time alert feed, incident timeline, detail views, stats dashboard, source management, dark/light theme.

**After Frontend (Milestone 4–5):**
- Browser Security Agent (Chrome MV3 extension)
- SDKs (Flask, FastAPI, Express middleware + Python/JS clients)

**Finally (Milestone 6):**
- Attack Replay engine
- Production packaging (`pip install hawkeye`)
- Docker/K8s deployment configs
- Alembic migrations
- Comprehensive documentation

---

## 10. Future Vision

HawkEye becomes a **production-ready web application security monitoring platform** providing:

- **Real-time security monitoring** — Ingest, normalize, detect, correlate, alert
- **Browser telemetry** — Chrome extension captures CSP violations, DOM integrity, automation signals
- **Detection & correlation** — 7 built-in detectors + extensible framework
- **Incident management** — Grouped alerts, MITRE tags, severity escalation, status workflow
- **Live dashboard** — WebSocket-driven React UI with charts, timelines, drill-down
- **SDK integrations** — Drop-in middleware for Flask, FastAPI, Express + framework-agnostic clients
- **Optional self-hosted deployment** — Docker Compose for dev, K8s manifests for prod
- **Future PyPI package** — `pip install hawkeye` for instant integration

---

## Quick Reference Commands

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_detection.py -v

# Lint
ruff check .

# Start dev server (after Milestone 1)
uvicorn hawkeye.main:app --reload

# Install in editable mode
pip install -e .
```

---

## Key Files for Active Development

| Task | Primary Files |
|------|---------------|
| T-001 (BotDetector undefined var) | `hawkeye/services/detection/bot.py:113` |
| T-002 (BotDetector duplicate return) | `hawkeye/services/detection/bot.py:167-177` |
| T-003 (DetectionContext time window) | `hawkeye/services/detection/base.py` |
| T-010 (WebSocket support) | `hawkeye/main.py`, new `hawkeye/api/websocket.py` |

Read `SESSION.md` for current task details. Read `TODO.md` for full backlog.