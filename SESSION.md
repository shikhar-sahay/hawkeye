# HawkEye v2 - Session Documentation

## Session Metadata
- **Date**: 2026-08-17
- **Session ID**: 2026-08-17-02
- **Claude Model**: nvidia/nemotron-3-ultra-550b-a55b:free
- **Branch**: master
- **Commit**: 3559424

---

## Current Milestone Status

| Milestone | Status | Progress | Target | Achieved |
|-----------|--------|----------|--------|----------|
| **1: Backend MVP** | ✅ COMPLETE | 100% | 2026-07-27 | 2026-07-24 |
| **2: WebSocket Backend** | ✅ COMPLETE | 100% | After M1 | 2026-07-24 |
| **3: Frontend Dashboard** | ✅ COMPLETE | 100% | After M2 | 2026-08-02 |
| **4: Browser Security Agent** | 🟢 IN PROGRESS | ~10% | After M3 | — |
| **5: SDK Integrations** | ⏳ PLANNED | 0% | After M4 | — |
| **6: Attack Replay & Docs** | ⏳ PLANNED | 0% | After M5 | — |

---

## Current Active Engineering Task

### Task ID: T-039 - Dashboard End-to-End Verification & Fixes
### Status: **COMPLETED**

**Summary:** Diagnosed and fixed why Alerts and Incidents pages showed "Failed to load alerts/incidents — Unknown error" and WebSocket showed "Disconnected". Root cause was missing API key in WebSocket connection.

**Root Causes Identified:**

1. **Alerts/Incidents REST endpoints** - Already working correctly. The "Failed to load" errors were caused by the WebSocket connection failing, which triggered React Query to show error state.

2. **WebSocket Disconnection** - The frontend WebSocket implementations (`useWebSocket.ts` and `WebSocketContext.tsx`) were NOT sending the API key for authentication. The backend requires API key via one of:
   - `Authorization: Bearer <key>` header
   - `X-API-Key: <key>` header
   - `?api_key=<key>` query parameter

   Since WebSocket in browsers can't easily send custom headers, the query parameter approach is used.

**Fixes Applied:**

1. **`frontend/src/hooks/useWebSocket.ts`** - Added `apiKey` to query parameters in `getWsUrl()`:
   ```typescript
   const apiKeyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
   return `${protocol}//${host}/ws?subscribe=${encodeURIComponent(subscribeParam)}${apiKeyParam}`;
   ```

2. **`frontend/src/context/WebSocketContext.tsx`** - Added `apiKey` to query parameters in `getWsUrl()`:
   ```typescript
   const apiKeyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
   return `/ws?subscribe=${encodeURIComponent(subscribeParam)}${apiKeyParam}`;
   ```

**Verification Performed:**
- Direct API test with demo key: `GET /api/v1/alerts` ✅ Returns data
- Direct API test with demo key: `GET /api/v1/incidents` ✅ Returns data
- Direct WebSocket test with demo key: `ws://localhost:8000/ws?subscribe=alerts,incidents&api_key=...` ✅ Connects, authenticates, receives "connected" message
- Backend tests: 33/33 pass ✅
- Frontend build: Successful ✅

**Files Modified:**
- `frontend/src/hooks/useWebSocket.ts`
- `frontend/src/context/WebSocketContext.tsx`

---

## Previous Fix: Sources Page Duplicate Heading (2026-08-17)

**Root Cause:** `SourceManager.tsx` had its own "Sources" page header in addition to the one from `Sources.tsx` page.

**Fix Applied:**
- Removed the redundant `<h1>Sources</h1>` header from `frontend/src/components/SourceManager.tsx`
- Preserved the Refresh and Add Source controls
- `Sources.tsx` page provides the page title

**Files Modified:**
- `frontend/src/components/SourceManager.tsx`

---

## Files to Review First Next Session

1. `frontend/src/hooks/useWebSocket.ts` - WebSocket hook with API key fix
2. `frontend/src/context/WebSocketContext.tsx` - WebSocket context with API key fix
3. `frontend/src/components/SourceManager.tsx` - Sources page component (heading fix)
4. `hawkeye/api/websocket.py` - WebSocket authentication implementation

---

## Quick Reference Commands

```bash
# Backend
pytest tests/ -v                    # All tests (33 pass)
ruff check hawkeye/                 # Lint (57 style warnings)
uvicorn hawkeye.main:app --reload   # Dev server (port 8000)

# Frontend
cd frontend
npm install                         # Install deps
npm run dev                         # Dev server (port 5173)
npm run build                       # TypeScript + Vite build
# Bundle: ~609 KB JS (gzipped: 174 KB), 40 KB CSS
# Charts: 6 separate chunks (loaded on demand)
npm run lint                        # ESLint check

# Browser Agent
cd browser-agent
npm install
npm run build                       # Build extension
npm run dev                         # Watch mode for development
npx tsc --noEmit                    # Type check
```