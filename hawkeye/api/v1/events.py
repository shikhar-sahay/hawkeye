"""Event query API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.deps import get_current_source, get_session
from hawkeye.models.events import Alert, ApplicationSource, NormalizedEvent
from hawkeye.schemas import EventListResponse, NormalizedEventResponse

router = APIRouter(tags=["events"])


@router.get(
    "/query",
    response_model=EventListResponse,
    summary="Query normalized events with filters",
)
async def query_events(
    category: str | None = Query(None),
    event_type: str | None = Query(None),
    severity: str | None = Query(None),
    user_id: str | None = Query(None),
    ip: str | None = Query(None),
    route: str | None = Query(None),
    method: str | None = Query(None),
    status_code: int | None = Query(None),
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> EventListResponse:
    """Query normalized events with various filters and pagination."""
    # Build base query - only events for this source
    stmt = select(NormalizedEvent).where(NormalizedEvent.source_id == source.id)

    # Apply filters
    if category:
        stmt = stmt.where(NormalizedEvent.category == category)
    if event_type:
        stmt = stmt.where(NormalizedEvent.event_type == event_type)
    if severity:
        stmt = stmt.where(NormalizedEvent.severity == severity)
    if user_id:
        stmt = stmt.where(NormalizedEvent.user_id == user_id)
    if ip:
        stmt = stmt.where(NormalizedEvent.ip == ip)
    if route:
        stmt = stmt.where(NormalizedEvent.route == route)
    if method:
        stmt = stmt.where(NormalizedEvent.method == method)
    if status_code:
        stmt = stmt.where(NormalizedEvent.status_code == status_code)
    if start_time:
        stmt = stmt.where(NormalizedEvent.timestamp >= start_time)
    if end_time:
        stmt = stmt.where(NormalizedEvent.timestamp <= end_time)

    # Get total count - build separate count query to avoid subquery issues
    count_stmt = select(func.count(NormalizedEvent.id)).where(
        NormalizedEvent.source_id == source.id
    )
    if category:
        count_stmt = count_stmt.where(NormalizedEvent.category == category)
    if event_type:
        count_stmt = count_stmt.where(NormalizedEvent.event_type == event_type)
    if severity:
        count_stmt = count_stmt.where(NormalizedEvent.severity == severity)
    if user_id:
        count_stmt = count_stmt.where(NormalizedEvent.user_id == user_id)
    if ip:
        count_stmt = count_stmt.where(NormalizedEvent.ip == ip)
    if route:
        count_stmt = count_stmt.where(NormalizedEvent.route == route)
    if method:
        count_stmt = count_stmt.where(NormalizedEvent.method == method)
    if status_code:
        count_stmt = count_stmt.where(NormalizedEvent.status_code == status_code)
    if start_time:
        count_stmt = count_stmt.where(NormalizedEvent.timestamp >= start_time)
    if end_time:
        count_stmt = count_stmt.where(NormalizedEvent.timestamp <= end_time)

    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination and ordering
    stmt = stmt.order_by(NormalizedEvent.timestamp.desc()).offset(offset).limit(limit)
    result = await session.execute(stmt)
    events = list(result.scalars().all())

    return EventListResponse(
        events=[NormalizedEventResponse.model_validate(e) for e in events],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{event_id}",
    response_model=NormalizedEventResponse,
    summary="Get a single normalized event by ID",
)
async def get_event(
    event_id: int,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> NormalizedEventResponse:
    """Get a single normalized event by ID."""
    stmt = select(NormalizedEvent).where(
        NormalizedEvent.id == event_id,
        NormalizedEvent.source_id == source.id,
    )
    result = await session.execute(stmt)
    event = result.scalars().first()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    return NormalizedEventResponse.model_validate(event)


@router.get(
    "/{event_id}/alerts",
    summary="Get alerts generated from an event",
)
async def get_event_alerts(
    event_id: int,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Get all alerts generated from a specific event."""
    # Verify event exists and belongs to source
    event_stmt = select(NormalizedEvent).where(
        NormalizedEvent.id == event_id,
        NormalizedEvent.source_id == source.id,
    )
    event_result = await session.execute(event_stmt)
    event = event_result.scalars().first()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Get alerts for this event
    alert_stmt = select(Alert).where(Alert.event_id == event_id)
    alert_result = await session.execute(alert_stmt)
    return list(alert_result.scalars().all())
