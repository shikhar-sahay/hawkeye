"""Incident API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.deps import get_current_source, get_session
from hawkeye.models.events import Alert, Incident, IncidentAlert
from hawkeye.models.events import ApplicationSource
from hawkeye.schemas import (
    IncidentListResponse,
    IncidentResponse,
    IncidentStatsResponse,
    IncidentStatusUpdate,
)

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _incident_to_response(
    incident: Incident,
    alerts: list[Alert] | None = None,
) -> IncidentResponse:
    """Convert Incident model to response schema."""
    alert_summaries = []
    if alerts:
        for alert in alerts:
            alert_summaries.append(
                {
                    "id": alert.id,
                    "detection_type": alert.detection_type,
                    "detector_name": alert.detector_name,
                    "severity": alert.severity,
                    "title": alert.title,
                    "created_at": alert.created_at,
                    "ip": alert.ip,
                    "user_id": alert.user_id,
                }
            )

    return IncidentResponse(
        id=incident.id,
        title=incident.title,
        description=incident.description,
        severity=incident.severity,
        status=incident.status,
        confidence=incident.confidence,
        affected_ips=incident.affected_ips,
        affected_users=incident.affected_users,
        affected_routes=incident.affected_routes,
        mitre_tactics=incident.mitre_tactics,
        mitre_techniques=incident.mitre_techniques,
        first_event_at=incident.first_event_at,
        last_event_at=incident.last_event_at,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
        closed_at=incident.closed_at,
        source_id=incident.source_id,
        alerts=alert_summaries,
    )


@router.get(
    "",
    response_model=IncidentListResponse,
    summary="List incidents with filters and pagination",
)
async def list_incidents(
    severity: str | None = Query(None),
    status: str | None = Query(None),
    source_id: int | None = Query(None),
    affected_ip: str | None = Query(None),
    affected_user: str | None = Query(None),
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> IncidentListResponse:
    """List incidents with optional filters."""
    # Build base query - only incidents for this source
    stmt = select(Incident).where(Incident.source_id == source.id)

    # Apply filters
    if severity:
        stmt = stmt.where(Incident.severity == severity)
    if status:
        stmt = stmt.where(Incident.status == status)
    if source_id:
        stmt = stmt.where(Incident.source_id == source_id)
    if affected_ip:
        # Filter by affected_ips JSON array - need to use JSON functions
        # For simplicity, we'll filter in Python or use a join
        pass
    if affected_user:
        pass
    if start_time:
        stmt = stmt.where(Incident.created_at >= start_time)
    if end_time:
        stmt = stmt.where(Incident.created_at <= end_time)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.exec(count_stmt)
    total = total_result.one()

    # Apply pagination and ordering
    stmt = stmt.order_by(Incident.created_at.desc()).offset(offset).limit(limit)
    result = await session.exec(stmt)
    incidents = list(result.all())

    # Fetch alerts for each incident
    incident_ids = [i.id for i in incidents]
    incident_alerts = {}
    if incident_ids:
        # Get incident-alert links
        link_stmt = select(IncidentAlert).where(IncidentAlert.incident_id.in_(incident_ids))
        link_result = await session.exec(link_stmt)
        links = list(link_result.all())

        # Get alerts
        alert_ids = [l.alert_id for l in links]
        alert_stmt = select(Alert).where(Alert.id.in_(alert_ids))
        alert_result = await session.exec(alert_stmt)
        alerts = {a.id: a for a in alert_result.all()}

        # Group alerts by incident
        for link in links:
            if link.incident_id not in incident_alerts:
                incident_alerts[link.incident_id] = []
            if link.alert_id in alerts:
                incident_alerts[link.incident_id].append(alerts[link.alert_id])

        # Sort alerts by sequence
        for inc_id, inc_alerts in incident_alerts.items():
            # Find corresponding link for sequence
            link_map = {l.alert_id: l.sequence for l in links if l.incident_id == inc_id}
            inc_alerts.sort(key=lambda a: link_map.get(a.id, 0))

    incident_responses = []
    for inc in incidents:
        inc_alerts = incident_alerts.get(inc.id, [])
        incident_responses.append(_incident_to_response(inc, inc_alerts))

    return IncidentListResponse(
        incidents=incident_responses,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/stats",
    response_model=IncidentStatsResponse,
    summary="Get incident statistics",
)
async def get_incident_stats(
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> IncidentStatsResponse:
    """Get aggregate incident statistics for the current source."""
    base_stmt = select(Incident).where(Incident.source_id == source.id)

    # Total
    total_result = await session.exec(select(func.count()).select_from(base_stmt.subquery()))
    total = total_result.one()

    # By severity
    severity_stmt = (
        select(Incident.severity, func.count()).where(Incident.source_id == source.id).group_by(Incident.severity)
    )
    severity_result = await session.exec(severity_stmt)
    by_severity = {row[0]: row[1] for row in severity_result.all()}

    # By status
    status_stmt = (
        select(Incident.status, func.count()).where(Incident.source_id == source.id).group_by(Incident.status)
    )
    status_result = await session.exec(status_stmt)
    by_status = {row[0]: row[1] for row in status_result.all()}

    # Open count
    open_stmt = select(func.count()).where(
        Incident.source_id == source.id,
        Incident.status.in_(["open", "investigating"]),
    )
    open_result = await session.exec(open_stmt)
    open_count = open_result.one()

    # Critical count
    critical_stmt = select(func.count()).where(
        Incident.source_id == source.id,
        Incident.severity == "critical",
    )
    critical_result = await session.exec(critical_stmt)
    critical_count = critical_result.one()

    return IncidentStatsResponse(
        total=total,
        by_severity=by_severity,
        by_status=by_status,
        open_count=open_count,
        critical_count=critical_count,
    )


@router.get(
    "/{incident_id}",
    response_model=IncidentResponse,
    summary="Get a single incident by ID",
)
async def get_incident(
    incident_id: int,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> IncidentResponse:
    """Get a single incident by ID with its alerts."""
    stmt = select(Incident).where(Incident.id == incident_id, Incident.source_id == source.id)
    result = await session.exec(stmt)
    incident = result.first()

    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    # Get linked alerts
    link_stmt = (
        select(IncidentAlert)
        .where(IncidentAlert.incident_id == incident_id)
        .order_by(IncidentAlert.sequence)
    )
    link_result = await session.exec(link_stmt)
    links = list(link_result.all())

    alert_ids = [l.alert_id for l in links]
    alerts = {}
    if alert_ids:
        alert_stmt = select(Alert).where(Alert.id.in_(alert_ids))
        alert_result = await session.exec(alert_stmt)
        alerts = {a.id: a for a in alert_result.all()}

    # Sort alerts by sequence
    sorted_alerts = [alerts[l.alert_id] for l in links if l.alert_id in alerts]

    return _incident_to_response(incident, sorted_alerts)


@router.get(
    "/{incident_id}/alerts",
    summary="Get all alerts linked to an incident",
)
async def get_incident_alerts(
    incident_id: int,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
):
    """Get all alerts linked to an incident."""
    # Verify incident exists and belongs to source
    inc_stmt = select(Incident).where(Incident.id == incident_id, Incident.source_id == source.id)
    inc_result = await session.exec(inc_stmt)
    incident = inc_result.first()

    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    # Get linked alerts
    link_stmt = (
        select(IncidentAlert)
        .where(IncidentAlert.incident_id == incident_id)
        .order_by(IncidentAlert.sequence)
    )
    link_result = await session.exec(link_stmt)
    links = list(link_result.all())

    alert_ids = [l.alert_id for l in links]
    alerts = []
    if alert_ids:
        alert_stmt = select(Alert).where(Alert.id.in_(alert_ids))
        alert_result = await session.exec(alert_stmt)
        alerts = list(alert_result.all())

    # Sort by sequence
    link_map = {l.alert_id: l.sequence for l in links}
    alerts.sort(key=lambda a: link_map.get(a.id, 0))

    return alerts


@router.patch(
    "/{incident_id}/status",
    response_model=IncidentResponse,
    summary="Update incident status",
)
async def update_incident_status(
    incident_id: int,
    status_update: IncidentStatusUpdate,
    source: ApplicationSource = Depends(get_current_source),
    session: AsyncSession = Depends(get_session),
) -> IncidentResponse:
    """Update an incident's status."""
    stmt = select(Incident).where(Incident.id == incident_id, Incident.source_id == source.id)
    result = await session.exec(stmt)
    incident = result.first()

    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    incident.status = status_update.status
    incident.updated_at = datetime.utcnow()
    if status_update.status in ["resolved", "closed"]:
        incident.closed_at = datetime.utcnow()

    session.add(incident)
    await session.commit()
    await session.refresh(incident)

    # Get alerts for response
    link_stmt = (
        select(IncidentAlert)
        .where(IncidentAlert.incident_id == incident_id)
        .order_by(IncidentAlert.sequence)
    )
    link_result = await session.exec(link_stmt)
    links = list(link_result.all())

    alert_ids = [l.alert_id for l in links]
    alerts = {}
    if alert_ids:
        alert_stmt = select(Alert).where(Alert.id.in_(alert_ids))
        alert_result = await session.exec(alert_stmt)
        alerts = {a.id: a for a in alert_result.all()}

    sorted_alerts = [alerts[l.alert_id] for l in links if l.alert_id in alerts]

    return _incident_to_response(incident, sorted_alerts)
