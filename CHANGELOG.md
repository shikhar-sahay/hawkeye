# HawkEye v2 Changelog

## [2.0.0] - 2026-07-20 - Backend MVP In Progress

### Added
- **FastAPI Application Bootstrap** (`hawkeye/main.py`)
  - Application lifespan management with database initialization
  - CORS middleware configuration
  - Health check endpoint (`/health`)
  - Root endpoint with service info

- **Configuration Management** (`hawkeye/config.py`)
  - Pydantic Settings with environment variable support
  - Application, API, Database, Security, Detection thresholds, Correlation, Frontend, CORS settings
  - Cached settings instance via `get_settings()`

- **Database Layer** (`hawkeye/database.py`)
  - Async SQLModel with SQLAlchemy 2.0
  - SQLite (dev) / PostgreSQL (prod) support
  - Session management with transaction handling
  - Global database instance with `create_all()`, `drop_all()`, `close()`

- **Core Authentication** (`hawkeye/core/auth.py`)
  - API key hashing with bcrypt
  - API key generation with prefix
  - Token verification utilities

- **Normalization Engine** (`hawkeye/core/normalization.py`)
  - Event categorization (auth, http, application, browser, custom)
  - Severity inference (high, medium, low)
  - MITRE ATT&CK tactic/technique mapping for 18 event types
  - Batch normalization support

- **Data Models** (`hawkeye/models/events.py`)
  - `ApplicationSource` — API key holders
  - `RawEvent` — Immutable raw event storage
  - `NormalizedEvent` — Standardized event schema with indexes
  - `Alert` — Detection alerts with evidence & confidence
  - `Incident` — Correlated alert groups with MITRE tags
  - `IncidentAlert` — Many-to-many link with sequence ordering
  - `ApiKey` — API key management with expiry

- **Pydantic Schemas** (`hawkeye/schemas/`)
  - Event ingestion schemas (single & batch)
  - Alert schemas (list, detail, stats, filter, status update)
  - Incident schemas (list, detail, stats, filter, status update)
  - Source/API key schemas

- **API Dependencies** (`hawkeye/api/deps.py`)
  - `get_current_source` — API key verification + source retrieval
  - `get_session` — Database session dependency
  - `verify_api_key` — Lightweight API key verification

- **Ingestion Service** (`hawkeye/services/ingestion_service.py`)
  - Single event ingestion with normalization
  - Batch event ingestion
  - Raw + normalized event persistence
  - Detection engine integration

- **Detection Engine** (`hawkeye/services/detection/engine.py`)
  - Orchestrates 7 detectors
  - Runs all detectors on each event
  - Alert persistence
  - Correlation engine integration

- **7 Detection Modules** (`hawkeye/services/detection/`)
  - `base.py` — BaseDetector, DetectionContext, Alert factory, Severity/DetectionType enums
  - `brute_force.py` — Failed login brute force, credential stuffing, distributed brute force
  - `credential_stuffing.py` — Credential stuffing detection (many usernames, one IP)
  - `enumeration.py` — Path/user/enum enumeration detection
  - `bot.py` — User agent analysis, headless browser detection, automation patterns, rate patterns, missing headers
  - `sensitive_actions.py` — Admin actions, data export, privilege escalation
  - `session_hijacking.py` — Impossible travel, session anomalies
  - `api_abuse.py` — API rate abuse, parameter tampering

- **Correlation Engine** (`hawkeye/services/correlation/engine.py`)
  - Time-window based alert correlation
  - Incident creation from correlated alerts
  - Severity escalation
  - MITRE tactic/technique aggregation

- **API v1 Router** (`hawkeye/api/v1/`)
  - `ingestion.py` — POST /events/ingest, POST /events/ingest/batch
  - `events.py` — GET /events (list with filters)
  - `sources.py` — CRUD for application sources & API keys
  - `alerts.py` — List, stats, get, update status
  - `incidents.py` — List, stats, get, alerts, update status

### Changed
- N/A (initial implementation)

### Fixed
- **T-003**: DetectionContext now uses detection-specific time window (60 min default) instead of correlation window (24 hours)
  - Added `detection_time_window_minutes` setting in `hawkeye/config.py`
  - Updated `DetectionContext.__post_init__` in `hawkeye/services/detection/base.py`
- **T-001/T-002**: Verified BotDetector fixes from commit 13ed3a2 — no undefined variables or duplicate returns
- All 18 unit tests pass (pytest 100% green)

---

## [2.0.0] - 2026-07-20 - Backend MVP In Progress
Previous Flask-based implementation - not maintained.