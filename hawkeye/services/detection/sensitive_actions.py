"""Sensitive action detection - admin actions, data exports, privilege changes."""

from collections import defaultdict
from typing import Any

from sqlmodel import select

from hawkeye.config import settings
from hawkeye.models.enums import DetectionType, EventType, Severity
from hawkeye.models.events import Alert, NormalizedEvent
from hawkeye.services.detection.base import BaseDetector, DetectionContext


class SensitiveActionDetector(BaseDetector):
    """Detects sensitive actions - admin access, data exports, privilege changes."""

    name = "sensitive_actions"
    detection_type = DetectionType.SENSITIVE_ACTION
    default_severity = Severity.MEDIUM
    default_confidence = 0.75

    SENSITIVE_EVENT_TYPES = {
        EventType.ADMIN_ACCESS: (Severity.HIGH, 0.9),
        EventType.DATA_EXPORT: (Severity.HIGH, 0.85),
        EventType.PRIVILEGE_ESCALATION: (Severity.CRITICAL, 0.95),
        EventType.ROLE_CHANGED: (Severity.HIGH, 0.9),
        EventType.API_KEY_CREATED: (Severity.MEDIUM, 0.8),
        EventType.BILLING_CHANGE: (Severity.MEDIUM, 0.7),
        EventType.USER_DELETED: (Severity.HIGH, 0.85),
        EventType.ACCOUNT_LOCKED: (Severity.MEDIUM, 0.7),
    }

    async def detect(self, context: DetectionContext) -> list[Alert]:
        """Detect sensitive actions."""
        event = context.event
        alerts = []

        # Direct sensitive event types
        if event.event_type in self.SENSITIVE_EVENT_TYPES:
            severity, confidence = self.SENSITIVE_EVENT_TYPES[event.event_type]
            alert = self._create_sensitive_action_alert(event, severity, confidence)
            if alert:
                alerts.append(alert)

        # Check for unusual admin activity from new IP
        alert_unusual = await self._check_unusual_admin_activity(context)
        if alert_unusual:
            alerts.append(alert_unusual)

        # Check for bulk sensitive actions
        alert_bulk = await self._check_bulk_sensitive_actions(context)
        if alert_bulk:
            alerts.append(alert_bulk)

        return alerts

    def _create_sensitive_action_alert(
        self, event: NormalizedEvent, severity: Severity, confidence: float
    ) -> Alert | None:
        """Create alert for sensitive action."""
        descriptions = {
            EventType.ADMIN_ACCESS: "Administrative panel access detected",
            EventType.DATA_EXPORT: "Data export initiated",
            EventType.PRIVILEGE_ESCALATION: "Privilege escalation detected",
            EventType.ROLE_CHANGED: "User role/permissions modified",
            EventType.API_KEY_CREATED: "New API key created",
            EventType.BILLING_CHANGE: "Billing/subscription changes",
            EventType.USER_DELETED: "User account deleted",
            EventType.ACCOUNT_LOCKED: "Account locked",
        }

        evidence: dict[str, Any] = {
            "ip": event.ip,
            "user_id": event.user_id,
            "event_type": event.event_type,
            "route": event.route,
            "method": event.method,
            "metadata": event.event_metadata,
        }

        return self._create_alert(
            event,
            f"Sensitive Action: {descriptions.get(event.event_type, event.event_type)}",
            (
                f"{descriptions.get(event.event_type, 'Sensitive action')} by user {event.user_id} "
                f"from IP {event.ip}. Route: {event.route}, Method: {event.method}."
            ),
            evidence,
            severity=severity,
            confidence=confidence,
        )

    async def _check_unusual_admin_activity(self, context: DetectionContext) -> Alert | None:
        """Check for admin actions from unusual IPs/locations."""
        event = context.event

        if event.event_type != EventType.ADMIN_ACCESS.value:
            return None

        if not event.user_id or not event.ip:
            return None

        # Check recent admin accesses by this user
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.user_id == event.user_id,
            NormalizedEvent.event_type == EventType.ADMIN_ACCESS.value,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        admin_events = list(result.all())

        # Get unique IPs used for admin access
        admin_ips = set(e.ip for e in admin_events if e.ip)

        if len(admin_ips) <= 1:
            return None  # Only one IP used - normal

        if event.ip not in admin_ips:
            return None  # This shouldn't happen since current event is included

        # This IP is new for admin access
        other_ips = admin_ips - {event.ip}

        evidence: dict[str, Any] = {
            "user_id": event.user_id,
            "new_admin_ip": event.ip,
            "previous_admin_ips": list(other_ips),
            "total_admin_sessions": len(admin_events),
            "user_agent": event.user_agent,
        }

        return self._create_alert(
            event,
            f"Admin Access from New IP for User {event.user_id}",
            (
                f"User {event.user_id} accessed admin panel from new IP {event.ip}. "
                f"Previous admin IPs: {', '.join(other_ips)}. Possible account compromise."
            ),
            evidence,
            severity=Severity.HIGH,
            confidence=0.8,
        )

    async def _check_bulk_sensitive_actions(self, context: DetectionContext) -> Alert | None:
        """Check for bulk sensitive actions by same user/IP."""
        event = context.event

        # Define bulk-sensitive event types
        bulk_types = {
            EventType.USER_DELETED.value,
            EventType.ROLE_CHANGED.value,
            EventType.DATA_EXPORT.value,
            EventType.API_KEY_CREATED.value,
        }

        if event.event_type not in bulk_types:
            return None

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.user_id == event.user_id,
            NormalizedEvent.event_type.in_(bulk_types),
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        sensitive_events = list(result.all())

        if len(sensitive_events) < 3:
            return None

        # Group by event type
        type_counts = defaultdict(int)
        for e in sensitive_events:
            type_counts[e.event_type] += 1

        evidence: dict[str, Any] = {
            "user_id": event.user_id,
            "ip": event.ip,
            "event_counts_by_type": dict(type_counts),
            "total_sensitive_actions": len(sensitive_events),
            "time_window_hours": settings.correlation_time_window_hours,
        }

        return self._create_alert(
            event,
            f"Bulk Sensitive Actions by User {event.user_id}",
            (
                f"User {event.user_id} from IP {event.ip} performed {len(sensitive_events)} "
                f"sensitive actions in {settings.correlation_time_window_hours} hours: "
                f"{dict(type_counts)}. Possible compromise or insider threat."
            ),
            evidence,
            severity=Severity.HIGH,
            confidence=0.85,
        )
