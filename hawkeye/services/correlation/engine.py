"""Correlation engine - groups alerts into incidents."""

import logging
from datetime import datetime, timedelta

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.websocket import connection_manager
from hawkeye.config import settings
from hawkeye.models.enums import IncidentSeverity, IncidentStatus
from hawkeye.models.events import Alert, Incident, IncidentAlert
from hawkeye.services.detection.base import Severity

logger = logging.getLogger(__name__)


class CorrelationEngine:
    """Correlates alerts into incidents based on time, actors, and attack patterns."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def correlate_alert(self, alert: Alert) -> Incident | None:
        """
        Correlate a new alert with existing alerts to create or update an incident.

        Returns the incident (new or existing) that the alert was added to,
        or None if no correlation was made.
        """
        # Try to find existing incident to correlate with
        incident = await self._find_matching_incident(alert)

        if incident:
            return await self._add_alert_to_incident(alert, incident)
        return await self._create_incident_from_alert(alert)

    async def _find_matching_incident(self, alert: Alert) -> Incident | None:
        """Find an existing open incident that matches this alert."""
        # Get recent open incidents
        since = datetime.utcnow() - timedelta(hours=settings.correlation_time_window_hours)

        stmt = select(Incident).where(
            Incident.status.in_([IncidentStatus.OPEN.value, IncidentStatus.INVESTIGATING.value]),
            Incident.updated_at >= since,
            Incident.source_id == alert.source_id,
        )
        result = await self.session.exec(stmt)
        incidents = list(result.all())

        if not incidents:
            return None

        # Score each incident for correlation
        best_incident = None
        best_score = 0

        for incident in incidents:
            score = await self._calculate_correlation_score(alert, incident)
            if score > best_score and score >= settings.correlation_min_alerts:
                best_score = score
                best_incident = incident

        return best_incident

    async def _calculate_correlation_score(self, alert: Alert, incident: Incident) -> float:
        """Calculate correlation score between alert and incident."""
        score = 0.0

        # Load event for the new alert
        from hawkeye.models.events import NormalizedEvent
        stmt = select(NormalizedEvent).where(NormalizedEvent.id == alert.event_id)
        result = await self.session.exec(stmt)
        alert_event = result.first()

        alert_ip = alert_event.ip if alert_event else None
        alert_user_id = alert_event.user_id if alert_event else None
        alert_session_id = alert_event.session_id if alert_event else None
        alert_route = alert_event.route if alert_event else None

        # Get alerts in this incident
        stmt = select(IncidentAlert).where(IncidentAlert.incident_id == incident.id)
        result = await self.session.exec(stmt)
        incident_alerts = list(result.all())

        if not incident_alerts:
            return 0.0

        # Get the actual alert objects
        alert_ids = [ia.alert_id for ia in incident_alerts]
        stmt = select(Alert).where(Alert.id.in_(alert_ids))
        result = await self.session.exec(stmt)
        existing_alerts = list(result.all())

        # Load events for existing alerts
        existing_events = {}
        if existing_alerts:
            existing_event_ids = [ea.event_id for ea in existing_alerts]
            stmt = select(NormalizedEvent).where(NormalizedEvent.id.in_(existing_event_ids))
            result = await self.session.exec(stmt)
            for ev in result.all():
                existing_events[ev.id] = ev

        # 1. Same IP correlation
        if alert_ip and any(
            existing_events.get(ea.event_id) and existing_events[ea.event_id].ip == alert_ip
            for ea in existing_alerts
        ):
            score += 3

        # 2. Same user correlation
        if alert_user_id and any(
            existing_events.get(ea.event_id) and existing_events[ea.event_id].user_id == alert_user_id
            for ea in existing_alerts
        ):
            score += 3

        # 3. Same session correlation
        if alert_session_id and any(
            existing_events.get(ea.event_id) and existing_events[ea.event_id].session_id == alert_session_id
            for ea in existing_alerts
        ):
            score += 4

        # 4. Same detection type chain
        detection_types = {a.detection_type for a in existing_alerts}
        if alert.detection_type in detection_types:
            score += 2

        # 5. MITRE ATT&CK tactic progression
        # Check if this alert continues an attack chain
        if await self._is_attack_chain_continuation(alert, existing_alerts):
            score += 3

        # 6. Time proximity - alerts close in time
        for ea in existing_alerts:
            time_diff = abs((alert.created_at - ea.created_at).total_seconds()) / 3600
            if time_diff < 1:
                score += 2
            elif time_diff < 6:
                score += 1

        # 7. Same route/endpoint
        if alert_route and any(
            existing_events.get(ea.event_id) and existing_events[ea.event_id].route == alert_route
            for ea in existing_alerts
        ):
            score += 1

        return score

    async def _is_attack_chain_continuation(
        self, alert: Alert, existing_alerts: list[Alert]
    ) -> bool:
        """Check if this alert continues a known attack chain (MITRE ATT&CK)."""
        # Define attack chain progressions
        chains = {
            "initial_access": ["credential_stuffing", "brute_force", "enumeration"],
            "credential_access": ["brute_force", "credential_stuffing"],
            "discovery": ["enumeration", "api_abuse"],
            "lateral_movement": ["session_hijacking", "privilege_escalation"],
            "collection": ["sensitive_action", "data_export"],
            "exfiltration": ["data_export", "api_abuse"],
            "impact": ["sensitive_action", "privilege_escalation"],
        }

        alert_type = alert.detection_type
        existing_types = {a.detection_type for a in existing_alerts}

        # Check if alert_type follows any existing type in a chain
        for chain_stage, types in chains.items():
            if alert_type in types:
                # Check if we have earlier stage alerts
                for stage, stage_types in chains.items():
                    if stage != chain_stage and any(t in existing_types for t in stage_types):
                        return True

        return False

    async def _create_incident_from_alert(self, alert: Alert) -> Incident:
        """Create a new incident from a single alert."""
        # Load the event to get ip, user_id, route
        from hawkeye.models.events import NormalizedEvent
        stmt = select(NormalizedEvent).where(NormalizedEvent.id == alert.event_id)
        result = await self.session.exec(stmt)
        event = result.first()

        # Determine incident severity from alert
        severity_map = {
            Severity.LOW: IncidentSeverity.LOW,
            Severity.MEDIUM: IncidentSeverity.MEDIUM,
            Severity.HIGH: IncidentSeverity.HIGH,
            Severity.CRITICAL: IncidentSeverity.CRITICAL,
        }
        incident_severity = severity_map.get(Severity(alert.severity), IncidentSeverity.MEDIUM)

        # Build title
        title = f"{alert.detection_type.replace('_', ' ').title()}: {alert.title}"

        # Build description
        ip = event.ip if event else None
        user_id = event.user_id if event else None
        route = event.route if event else None

        description = (
            f"Incident created from alert: {alert.title}\n"
            f"Detection: {alert.detector_name} ({alert.detection_type})\n"
            f"Severity: {alert.severity}\n"
            f"Confidence: {alert.confidence:.0%}\n"
            f"Source IP: {ip or 'N/A'}\n"
            f"User: {user_id or 'N/A'}"
        )

        # Extract MITRE ATT&CK info
        mitre_tactics = self._get_mitre_tactics(alert.detection_type)
        mitre_techniques = self._get_mitre_techniques(alert.detection_type)

        incident = Incident(
            source_id=alert.source_id,
            title=title,
            description=description,
            severity=incident_severity.value,
            status=IncidentStatus.OPEN.value,
            confidence=alert.confidence,
            affected_ips=[ip] if ip else [],
            affected_users=[user_id] if user_id else [],
            affected_routes=[route] if route else [],
            mitre_tactics=mitre_tactics,
            mitre_techniques=mitre_techniques,
            first_event_at=alert.created_at,
            last_event_at=alert.created_at,
        )

        self.session.add(incident)
        await self.session.flush()

        # Link alert to incident
        incident_alert = IncidentAlert(
            incident_id=incident.id,
            alert_id=alert.id,
            sequence=1,
        )
        self.session.add(incident_alert)

        # Update alert status
        alert.status = "correlated"
        self.session.add(alert)

        await self.session.commit()
        await self.session.refresh(incident)

        # Broadcast incident creation
        await self._broadcast_incident(incident, is_new=True)

        return incident

    async def _add_alert_to_incident(self, alert: Alert, incident: Incident) -> Incident:
        """Add an alert to an existing incident."""
        # Load the event to get ip, user_id, route
        from hawkeye.models.events import NormalizedEvent
        stmt = select(NormalizedEvent).where(NormalizedEvent.id == alert.event_id)
        result = await self.session.exec(stmt)
        event = result.first()

        ip = event.ip if event else None
        user_id = event.user_id if event else None
        route = event.route if event else None

        # Get current max sequence
        stmt = select(IncidentAlert).where(IncidentAlert.incident_id == incident.id)
        result = await self.session.exec(stmt)
        existing_links = list(result.all())
        next_sequence = len(existing_links) + 1

        # Create link
        incident_alert = IncidentAlert(
            incident_id=incident.id,
            alert_id=alert.id,
            sequence=next_sequence,
        )
        self.session.add(incident_alert)

        # Update incident
        incident.updated_at = datetime.utcnow()
        incident.last_event_at = max(incident.last_event_at, alert.created_at)
        incident.confidence = max(incident.confidence, alert.confidence)

        # Update affected entities
        if ip and ip not in incident.affected_ips:
            incident.affected_ips.append(ip)
        if user_id and user_id not in incident.affected_users:
            incident.affected_users.append(user_id)
        if route and route not in incident.affected_routes:
            incident.affected_routes.append(route)

        # Update MITRE ATT&CK
        new_tactics = self._get_mitre_tactics(alert.detection_type)
        new_techniques = self._get_mitre_techniques(alert.detection_type)
        for t in new_tactics:
            if t not in incident.mitre_tactics:
                incident.mitre_tactics.append(t)
        for t in new_techniques:
            if t not in incident.mitre_techniques:
                incident.mitre_techniques.append(t)

        # Update severity if needed
        severity_order = {
            IncidentSeverity.LOW: 1,
            IncidentSeverity.MEDIUM: 2,
            IncidentSeverity.HIGH: 3,
            IncidentSeverity.CRITICAL: 4,
        }
        alert_severity = severity_order.get(Severity(alert.severity), 2)
        current_severity = severity_order.get(IncidentSeverity(incident.severity), 2)
        if alert_severity > current_severity:
            incident.severity = IncidentSeverity(alert_severity).value

        # Update alert status
        alert.status = "correlated"
        self.session.add(alert)

        self.session.add(incident)
        await self.session.commit()
        await self.session.refresh(incident)

        # Broadcast incident update
        await self._broadcast_incident(incident, is_new=False)

        return incident

    def _get_mitre_tactics(self, detection_type: str) -> list[str]:
        """Map detection type to MITRE ATT&CK tactics."""
        mapping = {
            "brute_force": ["initial-access", "credential-access"],
            "credential_stuffing": ["initial-access", "credential-access"],
            "enumeration": ["discovery", "reconnaissance"],
            "bot_detection": ["reconnaissance", "initial-access"],
            "sensitive_action": ["collection", "impact"],
            "session_hijacking": ["credential-access", "lateral-movement"],
            "api_abuse": ["discovery", "collection"],
        }
        return mapping.get(detection_type, [])

    def _get_mitre_techniques(self, detection_type: str) -> list[str]:
        """Map detection type to MITRE ATT&CK techniques."""
        mapping = {
            "brute_force": ["T1110.001", "T1110.003"],
            # Password Guessing, Password Spraying
            "credential_stuffing": ["T1110.004"],
            # Credential Stuffing
            "enumeration": ["T1590.005", "T1083"],
            # Active Directory Reconnaissance, File/Directory Discovery
            "bot_detection": ["T1583.006", "T1588.002"],
            # Web Services, Tool
            "sensitive_action": ["T1005", "T1567"],
            # Data from Local System, Exfiltration
            "session_hijacking": ["T1556.002", "T1550.001"],
            # Password Filter, Application Access Token
            "api_abuse": ["T1059.007", "T1595"],
            # JavaScript, Active Scanning
        }
        return mapping.get(detection_type, [])

    async def auto_close_stale_incidents(self) -> int:
        """Auto-close incidents that haven't been updated in the configured time."""
        cutoff = datetime.utcnow() - timedelta(hours=settings.incident_auto_close_hours)

        stmt = select(Incident).where(
            Incident.status.in_([IncidentStatus.OPEN.value, IncidentStatus.INVESTIGATING.value]),
            Incident.updated_at < cutoff,
        )
        result = await self.session.exec(stmt)
        stale_incidents = list(result.all())

        count = 0
        for incident in stale_incidents:
            incident.status = IncidentStatus.CLOSED.value
            incident.closed_at = datetime.utcnow()
            self.session.add(incident)
            count += 1

        if count > 0:
            await self.session.commit()

        return count

    async def _broadcast_incident(self, incident: Incident, is_new: bool = False) -> None:
        """Broadcast incident creation or update to WebSocket subscribers."""
        try:

            def _iso(dt: datetime | None) -> str | None:
                return dt.isoformat() + "Z" if dt else None

            incident_data = {
                "id": incident.id,
                "source_id": incident.source_id,
                "title": incident.title,
                "description": incident.description,
                "severity": incident.severity,
                "status": incident.status,
                "confidence": incident.confidence,
                "affected_ips": incident.affected_ips,
                "affected_users": incident.affected_users,
                "affected_routes": incident.affected_routes,
                "mitre_tactics": incident.mitre_tactics,
                "mitre_techniques": incident.mitre_techniques,
                "first_event_at": _iso(incident.first_event_at),
                "last_event_at": _iso(incident.last_event_at),
                "created_at": _iso(incident.created_at),
                "updated_at": _iso(incident.updated_at),
                "is_new": is_new,
            }
            sent = await connection_manager.broadcast_incident(incident_data, incident.source_id)
            if sent > 0:
                logger.debug(
                    "Broadcast incident %s (new=%s) to %d WebSocket connections",
                    incident.id,
                    is_new,
                    sent,
                )
        except Exception as e:
            # Don't fail correlation if broadcast fails
            logger.warning("Failed to broadcast incident %s: %s", incident.id, e)
