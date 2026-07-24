"""Alert API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.deps import get_current_source, get_session
from hawkeye.models.events import Alert, NormalizedEvent
from hawkeye.models.events import ApplicationSource
from hawkeye.schemas import (
    AlertFilter,
    AlertListResponse,
    AlertResponse,
    AlertStatsResponse,
    AlertStatusUpdate,
)

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _alert_to_response(alert: Alert, event: NormalizedEvent | None = None) -> AlertResponse:
    """Convert Alert model to response schema."""
    return AlertResponse(
        id=alert.id,
        source_id=alert.source_id,
        event_id=alert.event_id,
        detection_type=alert.detection_type,
        detector_name=alert.detector_name,
        severity=alert.severity,
        title=alert.title,
        description=alert.description,
        evidence=alert.evidence,
        confidence=alert.confidence,
        status=alert.status,
        created_at=alert.created_at,
        updated_at=alert.updated_at,
        ip=event.ip if event else None,
        user_id=event.user_id if event else None,
        session_id=event.session_id if event else None,
        route=event.route if event else None,
        mitre_tactics=event.mitre_tactic.split(",") if event and event.mitre_tactic else [],
        mitre_techniques=[event.mitre_technique] if event and event.mitre_technique else [],
    )


@router.get(
    "",
    response_model=AlertListResponse,
    summary="List alerts with filters",
)
async def list_alerts(
    filter_params: AlertFilter = Depends(),
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> AlertListResponse:
    """List alerts with various filters and pagination."""
    stmt = select(Alert).where(Alert.source_id == source.id)

    # Apply filters that require joining with NormalizedEvent
    needs_event_join = any([
        filter_params.ip,
        filter_params.user_id,
        filter_params.session_id,
        filter_params.route,
    ])

    if needs_event_join:
        stmt = stmt.join(NormalizedEvent, Alert.event_id == NormalizedEvent.id)

    # Apply filters
    if filter_params.detection_type:
        stmt = stmt.where(Alert.detection_type == filter_params.detection_type)
    if filter_params.detector_name:
        stmt = stmt.where(Alert.detector_name == filter_params.detector_name)
    if filter_params.severity:
        stmt = stmt.where(Alert.severity == filter_params.severity)
    if filter_params.status:
        stmt = stmt.where(Alert.status == filter_params.status)
    if filter_params.ip:
        stmt = stmt.where(NormalizedEvent.ip == filter_params.ip)
    if filter_params.user_id:
        stmt = stmt.where(NormalizedEvent.user_id == filter_params.user_id)
    if filter_params.session_id:
        stmt = stmt.where(NormalizedEvent.session_id == filter_params.session_id)
    if filter_params.route:
        stmt = stmt.where(NormalizedEvent.route == filter_params.route)
    if filter_params.start_time:
        stmt = stmt.where(Alert.created_at >= filter_params.start_time)
    if filter_params.end_time:
        stmt = stmt.where(Alert.created_at <= filter_params.end_time)

    # Get total count - build separate count query to avoid subquery issues with joins
    count_stmt = select(func.count(Alert.id)).where(Alert.source_id == source.id)
    if needs_event_join:
        count_stmt = count_stmt.join(NormalizedEvent, Alert.event_id == NormalizedEvent.id)
    if filter_params.detection_type:
        count_stmt = count_stmt.where(Alert.detection_type == filter_params.detection_type)
    if filter_params.detector_name:
        count_stmt = count_stmt.where(Alert.detector_name == filter_params.detector_name)
    if filter_params.severity:
        count_stmt = count_stmt.where(Alert.severity == filter_params.severity)
    if filter_params.status:
        count_stmt = count_stmt.where(Alert.status == filter_params.status)
    if filter_params.ip:
        count_stmt = count_stmt.where(NormalizedEvent.ip == filter_params.ip)
    if filter_params.user_id:
        count_stmt = count_stmt.where(NormalizedEvent.user_id == filter_params.user_id)
    if filter_params.session_id:
        count_stmt = count_stmt.where(NormalizedEvent.session_id == filter_params.session_id)
    if filter_params.route:
        count_stmt = count_stmt.where(NormalizedEvent.route == filter_params.route)
    if filter_params.start_time:
        count_stmt = count_stmt.where(Alert.created_at >= filter_params.start_time)
    if filter_params.end_time:
        count_stmt = count_stmt.where(Alert.created_at <= filter_params.end_time)

    total_result = await session.exec(count_stmt)
    total = total_result.one()

    # Apply ordering and pagination
    stmt = (
        stmt.order_by(Alert.created_at.desc())
        .offset(filter_params.offset)
        .limit(filter_params.limit)
    )

    result = await session.exec(stmt)
    alerts = list(result.all())

    # Fetch related events for additional context
    alert_ids = [a.id for a in alerts]
    events_map = {}
    if alert_ids:
        event_stmt = select(NormalizedEvent).where(NormalizedEvent.id.in_(
            select(Alert.event_id).where(Alert.id.in_(alert_ids))
        ))
        event_result = await session.exec(event_stmt)
        events = list(event_result.all())
        events_map = {e.id: e for e in events}

    return AlertListResponse(
        alerts=[
            _alert_to_response(a, events_map.get(a.event_id))
            for a in alerts
        ],
        total=total,
        limit=filter_params.limit,
        offset=filter_params.offset,
    )


@router.get(
    "/stats",
    response_model=AlertStatsResponse,
    summary="Get alert statistics",
)
async def get_alert_stats(
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> AlertStatsResponse:
    """Get aggregate alert statistics."""
    # Total count
    total_stmt = select(func.count(Alert.id)).where(Alert.source_id == source.id)
    total_result = await session.exec(total_stmt)
    total = total_result.one()

    # By severity
    severity_stmt = (
        select(Alert.severity, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.severity)
    )
    severity_result = await session.exec(severity_stmt)
    by_severity = {row[0]: row[1] for row in severity_result.all()}

    # By status
    status_stmt = (
        select(Alert.status, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.status)
    )
    status_result = await session.exec(status_stmt)
    by_status = {row[0]: row[1] for row in status_result.all()}

    # By detection type
    det_type_stmt = (
        select(Alert.detection_type, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.detection_type)
    )
    det_type_result = await session.exec(det_type_stmt)
    by_detection_type = {row[0]: row[1] for row in det_type_result.all()}

    # By detector
    detector_stmt = (
        select(Alert.detector_name, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.detector_name)
    )
    detector_result = await session.exec(detector_stmt)
    by_detector = {row[0]: row[1] for row in detector_result.all()}

    return AlertStatsResponse(
        total=total,
        by_severity=by_severity,
        by_status=by_status,
        by_detection_type=by_detection_type,
        by_detector=by_detector,
    )


@router.get(
    "/{alert_id}",
    response_model=AlertResponse,
    summary="Get a single alert by ID",
)
async def get_alert(
    alert_id: int,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> AlertResponse:
    """Get a single alert by ID."""
    stmt = select(Alert).where(Alert.id == alert_id, Alert.source_id == source.id)
    result = await session.exec(stmt)
    alert = result.first()

    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Fetch related event
    event_stmt = select(NormalizedEvent).where(NormalizedEvent.id == alert.event_id)
    event_result = await session.exec(event_stmt)
    event = event_result.first()

    return _alert_to_response(alert, event)


@router.patch(
    "/{alert_id}",
    response_model=AlertResponse,
    summary="Update alert status",
)
async def update_alert_status(
    alert_id: int,
    update: AlertStatusUpdate,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> AlertResponse:
    """Update an alert's status."""
    stmt = select(Alert).where(Alert.id == alert_id, Alert.source_id == source.id)
    result = await session.exec(stmt)
    alert = result.first()

    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert.status = update.status
    alert.updated_at = datetime.utcnow()
    session.add(alert)
    await session.commit()
    await session.refresh(alert)

    # Fetch related event for response
    event_stmt = select(NormalizedEvent).where(NormalizedEvent.id == alert.event_id)
    event_result = await session.exec(event_stmt)
    event = event_result.first()

    return _alert_to_response(alert, event)
