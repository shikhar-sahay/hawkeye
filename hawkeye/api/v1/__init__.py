"""API v1 router."""

from fastapi import APIRouter

from hawkeye.api.v1 import alerts, events, incidents, ingestion, sources

api_router = APIRouter()
api_router.include_router(ingestion.router, prefix="/events", tags=["ingestion"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(alerts.router, tags=["alerts"])
api_router.include_router(incidents.router, tags=["incidents"])
api_router.include_router(sources.router, tags=["sources"])
