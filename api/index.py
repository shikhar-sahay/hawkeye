"""Vercel serverless entrypoint for the HawkEye FastAPI application.

Vercel's Python runtime detects the exported ASGI `app` and serves every
rewritten `/api/*` request through the existing FastAPI application: same
routers, same auth, same ingestion/detection/correlation code as local
uvicorn. No Mangum adapter is needed.

Serverless differences from local uvicorn are controlled by environment:
- HAWKEYE_SKIP_CREATE_ALL=1: skip DDL on boot (Supabase schema comes from
  supabase/migrations/*.sql; create_all is harmless but wasteful per cold
  start).
- HAWKEYE_DISABLE_HEARTBEAT=1: do not start the WebSocket heartbeat task
  (no persistent connections exist serverless; realtime delivery uses
  Supabase Realtime instead). The local uvicorn path is unaffected.

Set both in the Vercel project environment. WebSocket routes stay mounted
but are inert on serverless (no upgrade support); the frontend uses
Supabase Realtime in production and never calls /ws there.
"""

from hawkeye.main import app

__all__ = ["app"]
