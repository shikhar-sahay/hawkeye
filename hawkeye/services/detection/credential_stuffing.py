"""Credential stuffing detection - many usernames from same IP in short time."""

from collections import defaultdict
from typing import Any

from sqlmodel import select

from hawkeye.config import settings
from hawkeye.models.enums import DetectionType, EventType, Severity
from hawkeye.models.events import Alert, NormalizedEvent
from hawkeye.services.detection.base import BaseDetector, DetectionContext


class CredentialStuffingDetector(BaseDetector):
    """Detects credential stuffing - many usernames from single IP."""

    name = "credential_stuffing"
    detection_type = DetectionType.CREDENTIAL_STUFFING
    default_severity = Severity.HIGH
    default_confidence = 0.85

    async def detect(self, context: DetectionContext) -> list[Alert]:
        """Detect credential stuffing patterns."""
        event = context.event

        if not event.ip or event.event_type != EventType.LOGIN_FAILED.value:
            return []

        # Check if we already have an alert for this IP recently
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.event_type == EventType.LOGIN_FAILED.value,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        failed_logins = list(result.all())

        # Group by username
        username_counts: dict[str, int] = defaultdict(int)
        for e in failed_logins:
            if e.user_id:
                username_counts[e.user_id] += 1

        unique_usernames = len(username_counts)

        if unique_usernames < settings.cred_stuffing_max_usernames:
            return []

        # Check time window
        if failed_logins:
            earliest = min(e.timestamp for e in failed_logins)
            latest = max(e.timestamp for e in failed_logins)
            window_minutes = (latest - earliest).total_seconds() / 60

            if window_minutes > settings.cred_stuffing_window_minutes:
                return []

        # Build evidence
        top_usernames = sorted(username_counts.items(), key=lambda x: x[1], reverse=True)[:10]

        evidence: dict[str, Any] = {
            "ip": event.ip,
            "unique_usernames_attempted": unique_usernames,
            "total_failed_attempts": len(failed_logins),
            "time_window_minutes": int(window_minutes),
            "top_targeted_usernames": [
                {"username": u, "attempts": c} for u, c in top_usernames
            ],
        }

        return [
            self._create_alert(
                event,
                f"Credential Stuffing Attack from {event.ip}",
                f"Detected {len(failed_logins)} failed login attempts from IP {event.ip} "
                f"targeting {unique_usernames} unique usernames within {int(window_minutes)} minutes. "
                f"This pattern is consistent with credential stuffing attacks.",
                evidence,
            )
        ]
