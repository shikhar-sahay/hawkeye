# HawkEye v2 Roadmap

## Overall Project Goal
Build a production-ready Web Application Security Monitoring Platform (SIEM) with real-time dashboard, WebSocket updates, browser security agent, and SDK integrations.

---

## Major Milestones

### Milestone 1: Backend MVP
**Target: 2026-07-27 (1 week from start)**
**Status: ✅ 100% COMPLETE — Achieved 2026-07-24**
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
**Status: ✅ 100% COMPLETE — Achieved 2026-07-24**
- WebSocket server implementation
- Real-time alert/incident broadcast
- Connection management & auth
- WebSocket client reconnection logic
- Health & connection status endpoints

### Milestone 3: Frontend Dashboard
**Target: TBD (after Milestone 2)**
**Status: 🟢 ~40% IN PROGRESS — Backend 100% Ready**
- React + TypeScript + Vite setup ✅ COMPLETE
- Tailwind CSS + shadcn/ui components ✅ COMPLETE
- Real-time alert feed (WebSocket) 🟢 NEXT (T-022)
- Incident timeline view 🟢 PENDING (T-023)
- Alert/Incident detail views 🟢 PENDING (T-024)
- Statistics dashboard with charts 🟢 PENDING (T-025)
- Source/API key management UI 🟢 PENDING (T-026)
- Dark/light theme 🟢 PARTIAL (ThemeProvider ✅, Toggle 🟢)

### Milestone 4: Browser Security Agent
**Target: TBD (after Milestone 3)**
**Status: ⏳ PLANNED — 0%**
- Browser extension (Manifest V3)
- Content script for DOM monitoring
- CSP violation detection
- DOM integrity monitoring
- Bot/automation detection
- Event batching & batch send to HawkEye API
- CSP reporting integration

### Milestone 5: SDK Integrations
**Target: TBD (after Milestone 4)**
**Status: ⏳ PLANNED — 0%**
- Python/Flask SDK (middleware)
- FastAPI middleware
- Express.js/Node.js middleware
- Python SDK for direct API usage
- Framework-agnostic client library

### Milestone 6: Attack Replay & Documentation
**Target: TBD (after Milestone 5)**
**Status: ⏳ PLANNED — 0%**
- Attack replay engine
- Replay API endpoints
- Replay UI in dashboard
- Comprehensive API documentation (OpenAPI)
- Deployment guide (Docker, Kubernetes)
- Architecture documentation
- Integration guides

---

## Current Status
**Active Milestone: Milestone 3 - Frontend Dashboard**
**Progress: ~40% (Backend 100% Ready, Frontend scaffold + Dashboard + Events page complete)**

---

## Milestone Dependencies
```
Milestone 1 (Backend MVP) → Milestone 2 (WebSocket Backend)
    ↓                              ↓
Milestone 2 (WebSocket Backend) → Milestone 3 (Frontend Dashboard)
    ↓                              ↓
Milestone 3 (Frontend) → Milestone 4 (Browser Agent)
    ↓                              ↓
Milestone 4 (Browser Agent) → Milestone 5 (SDKs)
    ↓                              ↓
Milestone 5 (SDKs) → Milestone 6 (Attack Replay & Docs)
```

---

## Frontend Implementation Status (Milestone 3 Detail)

### ✅ COMPLETED
| Component | Status | Location |
|-----------|--------|----------|
| React 18 + TypeScript + Vite setup | ✅ | `frontend/` |
| Tailwind CSS configuration | ✅ | `frontend/tailwind.config.js` |
| shadcn/ui component library | ✅ | `frontend/src/components/ui/` |
| 14 UI primitives (Button, Card, Badge, Table, Input, Select, Dialog, Toast, Tabs, Avatar, Dropdown, ScrollArea, Separator, Label, Switch, Tooltip) | ✅ | `frontend/src/components/ui/` |
| ThemeProvider (dark/light, localStorage) | ✅ | `frontend/src/components/providers/ThemeProvider.tsx` |
| React Router v6 with nested routes | ✅ | `frontend/src/App.tsx` |
| TanStack Query (React Query) setup | ✅ | `frontend/src/main.tsx` |
| API client with full TypeScript types | ✅ | `frontend/src/api/client.ts` |
| AppLayout with collapsible Sidebar | ✅ | `frontend/src/components/layout/AppLayout.tsx`, `Sidebar.tsx` |
| TopNav with ThemeToggle | ✅ | `frontend/src/components/layout/TopNav.tsx`, `frontend/src/components/ThemeToggle.tsx` |
| DashboardPage (stats cards, quick actions, recent alerts placeholder) | ✅ | `frontend/src/pages/Dashboard.tsx` |
| EventsPage (filterable/searchable table with placeholder data) | ✅ | `frontend/src/pages/Events.tsx` |
| Routing for all 7 pages (Dashboard, Events, Alerts, Incidents, Sources, API Keys, Settings) | ✅ | `frontend/src/App.tsx` |

### 🟢 IN PROGRESS / NEXT
| Task | Status | Details |
|------|--------|---------|
| T-022: WebSocket hook (`useWebSocket`) | 🟢 NEXT | Connect to `/ws`, auto-reconnect, session resume, subscriptions |
| T-022: AlertFeed component | 🟢 NEXT | Real-time alert list with severity badges, MITRE tags |
| T-022: Alerts page | 🟢 NEXT | Integrate AlertFeed, add filtering, status actions |
| T-023: Incident timeline | ⏳ PENDING | Timeline viz, MITRE tactics, real-time updates |
| T-024: Alert/Incident detail views | ⏳ PENDING | Modal/drawer, evidence, MITRE, status actions |
| T-025: Statistics dashboard with charts | ⏳ PENDING | Overview cards, time-series, pie/bar charts, MITRE heatmap |
| T-026: Source/API Key management UI | ⏳ PENDING | List, CRUD, key gen/revoke/rotate, copy to clipboard |
| T-027: Theme toggle in header | 🟢 PARTIAL | ThemeProvider done, need Toggle in TopNav |

### 📦 ALREADY INSTALLED DEPENDENCIES (package.json)
- `react`, `react-dom`, `react-router-dom`
- `@tanstack/react-query` (v5)
- `axios`, `recharts`, `lucide-react`
- `clsx`, `tailwind-merge`, `date-fns`
- `tailwindcss`, `autoprefixer`, `postcss`
- `typescript`, `vite`, `eslint`, `@types/react`

---

## Verification Commands

### Backend Verification (Milestones 1-2)
```bash
# Run all tests
pytest tests/ -v

# Lint check
ruff check hawkeye/

# Start dev server
uvicorn hawkeye.main:app --reload
```

### Frontend Verification (Milestone 3)
```bash
# In frontend/ directory
npm install
npm run dev      # Dev server (port 5173)
npm run build    # TypeScript compile + Vite build
npm run lint     # ESLint check
```