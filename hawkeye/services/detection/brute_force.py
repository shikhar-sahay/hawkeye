"""Brute force detection module."""

from collections import Counter
from datetime import datetime, timedelta

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.config import settings
from hawkeye.models.enums import DetectionType
from hawkeye.models.events import NormalizedEvent
from hawkeye.services.detection.base import Alert, DetectionContext, BaseDetector, Severity


class BruteForceDetector(BaseDetector):
    """Detects brute force login attempts."""

    name = "brute_force"
    detection_type = DetectionType.BRUTE_FORCE
    default_severity = Severity.MEDIUM
    default_confidence = 0.7

    async def detect(self, context: DetectionContext) -> list[Alert]:
        alerts = []

        event = context.event

        # Only process authentication events
        if event.category != "authentication" or event.event_type not in {
            "login_failed",
            "login",
            "account_locked",
        }:
            return alerts

        # Check for failed login brute force
        alert_failed = await self._check_failed_login_brute_force(context)
        if alert_failed:
            alerts.append(alert_failed)

        # Check for credential stuffing (many usernames, one password)
        alert_stuffing = await self._check_credential_stuffing(context)
        if alert_stuffing:
            alerts.append(alert_stuffing)

        # Check for distributed brute force (same username, many IPs)
        alert_distributed = await self._check_distributed_brute_force(context)
        if alert_distributed:
            alerts.append(alert_distributed)

        return alerts

    async def _check_failed_login_brute_force(self, context: DetectionContext) -> Alert | None:
        """Check for brute force on single account from single IP."""
        event = context.event

        if event.event_type != "login_failed":
            return None

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.user_id == event.user_id,
            NormalizedEvent.event_type == "login_failed",
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        failed_logins = list(result.all())

        if len(failed_logins) < settings.brute_force_max_attempts:
            return None

        # Check time window
        earliest = min(e.timestamp for e in failed_logins)
        latest = max(e.timestamp for e in failed_logins)
        window_minutes = (latest - earliest).total_seconds() / 60

        if window_minutes > settings.brute_force_window_minutes:
            return None

        # Check if followed by successful login (possible compromise)
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.user_id == event.user_id,
            NormalizedEvent.event_type == "login_success",
            NormalizedEvent.timestamp > latest,
        )
        result = await context.session.exec(stmt)
        success_after = result.first()

        evidence: dict = {
            "ip": event.ip,
            "user_id": event.user_id,
            "failed_attempts": len(failed_logins),
            "time_window_minutes": int(window_minutes),
            "first_attempt": earliest.isoformat(),
            "last_attempt": latest.isoformat(),
            "followed_by_success": success_after is not None,
            "success_timestamp": success_after.timestamp.isoformat() if success_after else None,
            "user_agent": event.user_agent,
        }

        severity = Severity.HIGH if success_after else Severity.MEDIUM
        confidence = 0.9 if success_after else 0.7

        title = f"Brute Force Attack on {event.user_id} from {event.ip}"
        if success_after:
            title += " - Account Compromised!"

        description = (
            f"Detected {len(failed_logins)} failed login attempts for user '{event.user_id}' "
            f"from IP {event.ip} within {int(window_minutes)} minutes."
        )
        if success_after:
            description += (
                f" A successful login followed at {success_after.timestamp}, "
                f"indicating potential account compromise."
            )

        return self._create_alert(
            event,
            title,
            description,
            evidence,
            severity=severity,
            confidence=confidence,
        )

    async def _check_credential_stuffing(self, context: DetectionContext) -> Alert | None:
        """Check for credential stuffing - many usernames from same IP."""
        event = context.event

        if event.event_type != "login_failed":
            return None

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.event_type == "login_failed",
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        failed_logins = list(result.all())

        unique_usernames = set(e.user_id for e in failed_logins if e.user_id)

        if len(unique_usernames) < settings.cred_stuffing_max_usernames:
            return None

        # Check time window
        earliest = min(e.timestamp for e in failed_logins)
        latest = max(e.timestamp for e in failed_logins)
        window_minutes = (latest - earliest).total_seconds() / 60

        if window_minutes > settings.cred_stuffing_window_minutes:
            return None

        # Count attempts per username
        username_counts = Counter(e.user_id for e in failed_logins if e.user_id)

        evidence: dict = {
            "ip": event.ip,
            "total_failed_attempts": len(failed_logins),
            "unique_usernames_tried": len(unique_usernames),
            "time_window_minutes": int(window_minutes),
            "top_targeted_usernames": [
                {"username": u, "attempts": c}
                for u, c in username_counts.most_common(10)
            ],
            "user_agent": event.user_agent,
        }

        return self._create_alert(
            event,
            f"Credential Stuffing Attack from {event.ip}",
            (
                f"Detected {len(failed_logins)} failed login attempts across "
                f"{len(unique_usernames)} unique usernames from IP {event.ip} "
                f"within {int(window_minutes)} minutes. "
                f"Pattern consistent with credential stuffing using leaked credentials."
            ),
            evidence,
            severity=Severity.HIGH,
            confidence=0.8,
        )

    async def _check_distributed_brute_force(self, context: DetectionContext) -> Alert | None:
        """Check for distributed brute force - same username from many IPs."""
        event = context.event

        if not event.user_id or event.event_type != "login_failed":
            return None

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.user_id == event.user_id,
            NormalizedEvent.event_type == "login_failed",
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        failed_logins = list(result.all())

        unique_ips = set(e.ip for e in failed_logins if e.ip)

        # Require multiple IPs targeting same account
        if len(unique_ips) < 3:
            return None

        # Check time window
        earliest = min(e.timestamp for e in failed_logins)
        latest = max(e.timestamp for e in failed_logins)
        window_minutes = (latest - earliest).total_seconds() / 60

        if window_minutes > settings.brute_force_window_minutes:
            return None

        ip_counts = Counter(e.ip for e in failed_logins if e.ip)

        evidence: dict = {
            "user_id": event.user_id,
            "total_failed_attempts": len(failed_logins),
            "unique_source_ips": len(unique_ips),
            "time_window_minutes": int(window_minutes),
            "top_source_ips": [
                {"ip": ip, "attempts": c} for ip, c in ip_counts.most_common(10)
            ],
        }

        return self._create_alert(
            event,
            f"Distributed Brute Force Against {event.user_id}",
            (
                f"Detected {len(failed_logins)} failed login attempts for user "
                f"'{event.user_id}' from {len(unique_ips)} different IPs within "
                f"{int(window_minutes)} minutes. Indicates coordinated distributed attack."
            ),
            evidence,
            severity=Severity.HIGH,
            confidence=0.75,
        )