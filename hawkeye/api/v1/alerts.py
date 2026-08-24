"""Alert API endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.deps import get_current_source, get_session
from hawkeye.models.events import Alert, ApplicationSource, NormalizedEvent
from hawkeye.schemas import (
    AlertFilter,
    AlertListResponse,
    AlertResponse,
    AlertStatsResponse,
    AlertStatusUpdate,
    MITRECoverageResponse,
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
    if filter_params.search:
        search_term = f"%{filter_params.search}%"
        stmt = stmt.where(
            Alert.title.ilike(search_term) |
            Alert.description.ilike(search_term) |
            Alert.detector_name.ilike(search_term) |
            Alert.detection_type.ilike(search_term)
        )
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
    if filter_params.search:
        search_term = f"%{filter_params.search}%"
        count_stmt = count_stmt.where(
            Alert.title.ilike(search_term) |
            Alert.description.ilike(search_term) |
            Alert.detector_name.ilike(search_term) |
            Alert.detection_type.ilike(search_term)
        )
    if filter_params.start_time:
        count_stmt = count_stmt.where(Alert.created_at >= filter_params.start_time)
    if filter_params.end_time:
        count_stmt = count_stmt.where(Alert.created_at <= filter_params.end_time)

    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply ordering and pagination
    stmt = (
        stmt.order_by(Alert.created_at.desc())
        .offset(filter_params.offset)
        .limit(filter_params.limit)
    )

    result = await session.execute(stmt)
    alerts = list(result.scalars().all())

    # Fetch related events for additional context
    alert_ids = [a.id for a in alerts]
    events_map = {}
    if alert_ids:
        event_stmt = select(NormalizedEvent).where(NormalizedEvent.id.in_(
            select(Alert.event_id).where(Alert.id.in_(alert_ids))
        ))
        event_result = await session.execute(event_stmt)
        events = list(event_result.scalars().all())
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
    total_result = await session.execute(total_stmt)
    total = total_result.scalar_one()

    # By severity
    severity_stmt = (
        select(Alert.severity, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.severity)
    )
    severity_result = await session.execute(severity_stmt)
    by_severity = {row[0]: row[1] for row in severity_result.all()}

    # By status
    status_stmt = (
        select(Alert.status, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.status)
    )
    status_result = await session.execute(status_stmt)
    by_status = {row[0]: row[1] for row in status_result.all()}

    # By detection type
    det_type_stmt = (
        select(Alert.detection_type, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.detection_type)
    )
    det_type_result = await session.execute(det_type_stmt)
    by_detection_type = {row[0]: row[1] for row in det_type_result.all()}

    # By detector
    detector_stmt = (
        select(Alert.detector_name, func.count(Alert.id))
        .where(Alert.source_id == source.id)
        .group_by(Alert.detector_name)
    )
    detector_result = await session.execute(detector_stmt)
    by_detector = {row[0]: row[1] for row in detector_result.all()}

    # Average confidence
    avg_conf_stmt = select(func.avg(Alert.confidence)).where(Alert.source_id == source.id)
    avg_conf_result = await session.execute(avg_conf_stmt)
    avg_confidence = avg_conf_result.scalar_one_or_none()
    if avg_confidence is not None:
        avg_confidence = round(avg_confidence, 2)

    return AlertStatsResponse(
        total=total,
        by_severity=by_severity,
        by_status=by_status,
        by_detection_type=by_detection_type,
        by_detector=by_detector,
        avg_confidence=avg_confidence,
    )


@router.get(
    "/mitre-coverage",
    response_model=MITRECoverageResponse,
    summary="Get MITRE ATT&CK coverage statistics",
)
async def get_mitre_coverage(
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> MITRECoverageResponse:
    """Get aggregated MITRE ATT&CK tactic and technique counts from alerts."""
    # Get alerts with their related events to access MITRE data
    stmt = (
        select(Alert, NormalizedEvent)
        .join(NormalizedEvent, Alert.event_id == NormalizedEvent.id)
        .where(Alert.source_id == source.id)
    )
    result = await session.execute(stmt)
    rows = result.all()

    tactic_counts: dict[str, int] = {}
    technique_counts: dict[str, int] = {}
    alerts_with_mitre = 0

    for alert, event in rows:
        has_mitre = False
        # Tactics from event (comma-separated string)
        if event.mitre_tactic:
            has_mitre = True
            for tactic in event.mitre_tactic.split(","):
                tactic = tactic.strip()
                if tactic:
                    tactic_counts[tactic] = tactic_counts.get(tactic, 0) + 1
        # Techniques from event
        if event.mitre_technique:
            has_mitre = True
            technique_counts[event.mitre_technique] = technique_counts.get(event.mitre_technique, 0) + 1
        if has_mitre:
            alerts_with_mitre += 1

    return MITRECoverageResponse(
        by_tactic=tactic_counts,
        by_technique=technique_counts,
        total_alerts_with_mitre=alerts_with_mitre,
    )


@router.get(
    "/time-series",
    response_model=list[dict[str, str | int]],
    summary="Get alert counts over time",
)
async def get_alerts_over_time(
    hours: int = Query(default=24, ge=1, le=720),
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, str | int]]:
    """Get alert counts grouped by time intervals over the specified hours."""
    since = datetime.utcnow() - timedelta(hours=hours)

    # Bucket size adapts to the requested range so the chart axis stays
    # readable: 24h -> hourly, 7d -> 4-hourly, 30d -> daily.
    if hours <= 24:
        bucket = timedelta(hours=1)
    elif hours <= 24 * 8:
        bucket = timedelta(hours=4)
    else:
        bucket = timedelta(days=1)

    # Use database-agnostic date truncation (works with SQLite and PostgreSQL)
    # SQLite: strftime('%Y-%m-%d %H:00:00', created_at)
    # PostgreSQL: date_trunc('hour', Alert.created_at)
    dialect_name = session.bind.dialect.name

    if dialect_name == "postgresql":
        hour_expr = func.date_trunc('hour', Alert.created_at)
    else:
        # SQLite: use strftime for hour truncation
        hour_expr = func.strftime('%Y-%m-%d %H:00:00', Alert.created_at)

    stmt = (
        select(
            hour_expr.label('hour'),
            func.count(Alert.id).label('count')
        )
        .where(Alert.source_id == source.id)
        .where(Alert.created_at >= since)
        .group_by(hour_expr)
        .order_by(hour_expr)
    )
    result = await session.execute(stmt)
    rows = result.all()

    # Normalize SQL rows into (utc datetime, count). SQLite strftime returns
    # naive strings in UTC; PostgreSQL date_trunc returns tz-aware values.
    counts: dict[datetime, int] = {}
    for row in rows:
        raw = row[0]
        if isinstance(raw, str):
            parsed = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
        elif raw.tzinfo is None:
            parsed = raw
        else:
            parsed = raw.astimezone(timezone.utc).replace(tzinfo=None)
        # Truncate to the bucket boundary so partial buckets merge correctly
        bucket_hours = bucket // timedelta(hours=1)
        if bucket_hours >= 24:
            key = parsed.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            aligned_hour = (parsed.hour // bucket_hours) * bucket_hours
            key = parsed.replace(hour=aligned_hour, minute=0, second=0, microsecond=0)
        counts[key] = counts.get(key, 0) + int(row[1])

    # Fill gaps with zero so the time axis is honest and chronological.
    # The cursor MUST be aligned to the same bucket grid as the counts keys
    # (UTC midnight-multiples), otherwise lookups miss and buckets read as 0.
    now = datetime.utcnow()
    series: list[dict[str, str | int]] = []
    cursor = since.replace(minute=0, second=0, microsecond=0)
    if bucket >= timedelta(days=1):
        cursor = cursor.replace(hour=0)
    elif bucket >= timedelta(hours=4):
        cursor = cursor.replace(hour=(cursor.hour // 4) * 4)
    while cursor <= now:
        value = counts.get(cursor, 0)
        series.append({"timestamp": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"), "value": value})
        cursor += bucket

    return series


@router.patch(
    "/{alert_id}",
    response_model=AlertResponse,
    summary="Update alert status",
)
async def update_alert_status(
    alert_id: int = Path(..., ge=1),
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
    update: AlertStatusUpdate = Body(...),
) -> AlertResponse:
    """Update an alert's status."""
    stmt = select(Alert).where(Alert.id == alert_id, Alert.source_id == source.id)
    result = await session.execute(stmt)
    alert = result.scalars().first()

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
    event_result = await session.execute(event_stmt)
    event = event_result.scalars().first()

    return _alert_to_response(alert, event)


@router.get(
    "/{alert_id}",
    response_model=AlertResponse,
    summary="Get a single alert by ID",
)
async def get_alert(
    alert_id: int = Path(..., ge=1),
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> AlertResponse:
    """Get a single alert by ID."""
    stmt = select(Alert).where(Alert.id == alert_id, Alert.source_id == source.id)
    result = await session.execute(stmt)
    alert = result.scalars().first()

    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Fetch related event
    event_stmt = select(NormalizedEvent).where(NormalizedEvent.id == alert.event_id)
    event_result = await session.execute(event_stmt)
    event = event_result.scalars().first()

    return _alert_to_response(alert, event)
