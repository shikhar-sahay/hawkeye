"""Event ingestion API endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.deps import get_current_source, get_session
from hawkeye.config import settings
from hawkeye.models.events import ApplicationSource
from hawkeye.schemas.ingestion import (
    BatchEventsIngest,
    BatchIngestResponse,
    EventIngestResponse,
    RawEventIngest,
)
from hawkeye.services.ingestion_service import IngestionService

router = APIRouter(tags=["ingestion"])

logger = logging.getLogger(__name__)


def _ingest_error(message: str, exc: Exception) -> HTTPException:
    """500 for ingestion failures. The full exception is logged server-side;
    clients only see internals outside production (where the detail aids SDK
    authors debugging against a dev server)."""
    logger.exception("%s", message)
    if settings.environment == "production":
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=message,
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"{message}: {str(exc)}",
    )


@router.post(
    "",
    response_model=EventIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest a single security event",
)
async def ingest_event(
    event: RawEventIngest,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
):
    """Ingest a single security event from an application source."""
    service = IngestionService(session)
    try:
        normalized = await service.ingest_event(event, source)
        return EventIngestResponse(
            success=True,
            event_id=normalized.id,
            normalized_event_id=normalized.id,
        )
    except Exception as e:
        raise _ingest_error("Failed to ingest event", e)


@router.post(
    "/batch",
    response_model=BatchIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest multiple security events",
)
async def ingest_batch(
    batch: BatchEventsIngest,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
):
    """Ingest a batch of security events efficiently."""
    service = IngestionService(session)
    try:
        normalized_events, event_ids = await service.ingest_batch(batch, source)
        return BatchIngestResponse(
            success=True,
            accepted=len(normalized_events),
            failed=0,
            event_ids=event_ids,
        )
    except Exception as e:
        raise _ingest_error("Failed to ingest batch", e)
