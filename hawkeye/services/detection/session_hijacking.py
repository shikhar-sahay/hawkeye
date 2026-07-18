"""Session hijacking detection - impossible travel, token theft, etc."""

from datetime import timedelta
from typing import Any

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.config import settings
from hawkeye.models.enums import DetectionType, EventType, Severity
from hawkeye.models.events import Alert, NormalizedEvent
from hawkeye.services.detection.base import BaseDetector, DetectionContext


class SessionHijackingDetector(BaseDetector):
    """Detects session hijacking - impossible travel, token reuse, etc."""

    name = "session_hijacking"
    detection_type = DetectionType.SESSION_HIJACKING
    default_severity = Severity.HIGH
    default_confidence = 0.75

    async def detect(self, context: DetectionContext) -> list[Alert]:
        alerts = []

        event = context.event

        # Only check if we have session_id
        if not event.session_id:
            return alerts

        # Check for impossible travel
        alert_travel = await self._check_impossible_travel(context)
        if alert_travel:
            alerts.append(alert_travel)

        # Check for concurrent sessions from different IPs
        alert_concurrent = await self._check_concurrent_sessions(context)
        if alert_concurrent:
            alerts.append(alert_concurrent)

        # Check for token reuse across IPs
        alert_token = await self._check_token_reuse(context)
        if alert_token:
            alerts.append(alert_token)

        # Check for session fixation
        alert_fixation = await self._check_session_fixation(context)
        if alert_fixation:
            alerts.append(alert_fixation)

        return alerts

    async def _check_impossible_travel(self, context: DetectionContext) -> Alert | None:
        """Check for impossible travel - same session from distant locations."""
        event = context.event

        if not event.ip:
            return None

        # Get recent events for this session
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.session_id == event.session_id,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        session_events = list(result.all())

        if len(session_events) < 2:
            return None

        # Get unique IPs with timestamps
        ip_timestamps = {}
        for e in session_events:
            if e.ip:
                if e.ip not in ip_timestamps:
                    ip_timestamps[e.ip] = []
                ip_timestamps[e.ip].append(e.timestamp)

        if len(ip_timestamps) < 2:
            return None

        # For each pair of IPs, check time difference
        ips = list(ip_timestamps.keys())
        for i in range(len(ips)):
            for j in range(i + 1, len(ips)):
                ip1, ip2 = ips[i], ips[j]

                # Get earliest and latest for each IP
                ip1_times = ip_timestamps[ip1]
                ip2_times = ip_timestamps[ip2]

                earliest_1 = min(ip1_times)
                latest_1 = max(ip1_times)
                earliest_2 = min(ip2_times)
                latest_2 = max(ip2_times)

                # Check if they overlap or are very close
                # If latest of one is after earliest of other, they're concurrent
                time_diff = abs((latest_1 - earliest_2).total_seconds()) / 3600  # hours
                time_diff_rev = abs((latest_2 - earliest_1).total_seconds()) / 3600

                # If both IPs active within the hijack window
                min_window = min(time_diff, time_diff_rev)
                if min_window > settings.session_hijack_window_hours:
                    continue

                # Calculate distance (simplified - in production use GeoIP)
                distance_km = self._estimate_distance(ip1, ip2)

                if distance_km > settings.session_hijack_max_distance_km:
                    evidence: dict[str, Any] = {
                        "session_id": event.session_id,
                        "ip_1": ip1,
                        "ip_2": ip2,
                        "estimated_distance_km": distance_km,
                        "time_overlap_hours": round(min_window, 2),
                        "ip_1_time_range": {
                            "start": earliest_1.isoformat(),
                            "end": latest_1.isoformat(),
                        },
                        "ip_2_time_range": {
                            "start": earliest_2.isoformat(),
                            "end": latest_2.isoformat(),
                        },
                        "user_id": event.user_id,
                        "user_agent_1": next(
                            (e.user_agent for e in session_events if e.ip == ip1), None
                        ),
                        "user_agent_2": next(
                            (e.user_agent for e in session_events if e.ip == ip2), None
                        ),
                    }

                    return self._create_alert(
                        event,
                        f"Impossible Travel: Session {event.session_id[:16]}...",
                        (
                            f"Session {event.session_id} used from IPs {ip1} and {ip2} "
                            f"(est. {distance_km:.0f} km apart) within {min_window:.1f} hours. "
                            f"Max allowed: {settings.session_hijack_max_distance_km} km / "
                            f"{settings.session_hijack_window_hours}h."
                        ),
                        evidence,
                        severity=Severity.CRITICAL if distance_km > settings.session_hijack_max_distance_km * 2 else Severity.HIGH,
                        confidence=0.85,
                    )

        return None

    def _estimate_distance(self, ip1: str, ip2: str) -> float:
        """Estimate distance between two IPs. In production, use GeoIP database."""
        # Simplified: return large distance for different /16 prefixes
        # Real implementation would use MaxMind GeoIP or similar
        try:
            parts1 = ip1.split(".")
            parts2 = ip2.split(".")
            if len(parts1) == 4 and len(parts2) == 4:
                # Different first octet = very far
                if parts1[0] != parts2[0]:
                    return 5000.0
                # Different second octet = far
                if parts1[1] != parts2[1]:
                    return 1000.0
                # Different third octet = moderate
                if parts1[2] != parts2[2]:
                    return 100.0
                # Same /24 = close
                return 10.0
        except (ValueError, IndexError):
            pass
        return 1000.0  # Default to far

    async def _check_concurrent_sessions(self, context: DetectionContext) -> Alert | None:
        """Check for multiple active sessions for same user from different IPs."""
        event = context.event

        if not event.user_id:
            return None

        # Get all recent sessions for this user
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.user_id == event.user_id,
            NormalizedEvent.timestamp >= context.time_window_start,
            NormalizedEvent.session_id.is_not(None),
        )
        result = await context.session.exec(stmt)
        user_events = list(result.all())

        # Group by session_id
        sessions = {}
        for e in user_events:
            if e.session_id not in sessions:
                sessions[e.session_id] = {"ips": set(), "times": []}
            if e.ip:
                sessions[e.session_id]["ips"].add(e.ip)
            sessions[e.session_id]["times"].append(e.timestamp)

        # Filter sessions with multiple IPs or concurrent sessions from different IPs
        multi_ip_sessions = {
            sid: data for sid, data in sessions.items() if len(data["ips"]) > 1
        }

        if multi_ip_sessions:
            # Check if sessions are concurrent
            session_ranges = []
            for sid, data in sessions.items():
                if data["times"]:
                    session_ranges.append({
                        "session_id": sid,
                        "start": min(data["times"]),
                        "end": max(data["times"]),
                        "ips": data["ips"],
                    })

            # Check for overlapping sessions from different IPs
            for i in range(len(session_ranges)):
                for j in range(i + 1, len(session_ranges)):
                    s1, s2 = session_ranges[i], session_ranges[j]
                    # Check overlap
                    if s1["start"] <= s2["end"] and s2["start"] <= s1["end"]:
                        # Overlapping sessions
                        if s1["ips"] != s2["ips"]:
                            evidence: dict[str, Any] = {
                                "user_id": event.user_id,
                                "session_1": {
                                    "id": s1["session_id"],
                                    "ips": list(s1["ips"]),
                                    "start": s1["start"].isoformat(),
                                    "end": s1["end"].isoformat(),
                                },
                                "session_2": {
                                    "id": s2["session_id"],
                                    "ips": list(s2["ips"]),
                                    "start": s2["start"].isoformat(),
                                    "end": s2["end"].isoformat(),
                                },
                                "overlap_minutes": round(
                                    (min(s1["end"], s2["end"]) - max(s1["start"], s2["start"])).total_seconds() / 60,
                                    1,
                                ),
                            }

                            return self._create_alert(
                                event,
                                f"Concurrent Sessions for User {event.user_id}",
                                (
                                    f"User {event.user_id} has overlapping sessions "
                                    f"({s1['session_id'][:16]}... and {s2['session_id'][:16]}...) "
                                    f"from different IPs: {s1['ips']} vs {s2['ips']}. "
                                    f"Overlap: {evidence['overlap_minutes']} minutes."
                                ),
                                evidence,
                                severity=Severity.HIGH,
                                confidence=0.8,
                            )

        return None

    async def _check_token_reuse(self, context: DetectionContext) -> Alert | None:
        """Check for session token reuse across different IPs."""
        event = context.event

        if not event.session_id:
            return None

        # Look for same session_id from different IPs in recent history
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.session_id == event.session_id,
            NormalizedEvent.ip != event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        other_ip_events = list(result.all())

        if not other_ip_events:
            return None

        unique_ips = set(e.ip for e in other_ip_events if e.ip)

        # Also check current IP events
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.session_id == event.session_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        current_ip_events = list(result.all())

        all_ips = unique_ips | {event.ip}

        if len(all_ips) < 2:
            return None

        # Check if both IPs have recent activity (within hijack window)
        earliest = min(e.timestamp for e in other_ip_events + current_ip_events)
        latest = max(e.timestamp for e in other_ip_events + current_ip_events)
        window_hours = (latest - earliest).total_seconds() / 3600

        if window_hours > settings.session_hijack_window_hours:
            return None

        evidence: dict[str, Any] = {
            "session_id": event.session_id,
            "user_id": event.user_id,
            "ips_involved": list(all_ips),
            "primary_ip": event.ip,
            "other_ips": list(unique_ips),
            "time_window_hours": round(window_hours, 2),
            "event_count_primary": len(current_ip_events),
            "event_count_other": len(other_ip_events),
        }

        return self._create_alert(
            event,
            f"Session Token Reuse: {event.session_id[:16]}...",
            (
                f"Session {event.session_id} used from {len(all_ips)} different IPs "
                f"within {window_hours:.1f} hours: {', '.join(all_ips)}. "
                f"Indicates session token sharing or theft."
            ),
            evidence,
            severity=Severity.HIGH,
            confidence=0.8,
        )

    async def _check_session_fixation(self, context: DetectionContext) -> Alert | None:
        """Check for session fixation - known session ID used before login."""
        event = context.event

        # Look for session activity before login
        if event.event_type not in {EventType.LOGIN_SUCCESS.value, EventType.LOGIN.value}:
            return None

        if not event.session_id:
            return None

        # Check if this session_id was used before login
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.session_id == event.session_id,
            NormalizedEvent.timestamp < event.timestamp,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        pre_login_events = list(result.all())

        if not pre_login_events:
            return None

        # Check if pre-login events were from different IP
        pre_login_ips = set(e.ip for e in pre_login_events if e.ip)

        if event.ip in pre_login_ips:
            # Same IP - could be legitimate (page load before login)
            return None

        if not pre_login_ips:
            return None

        evidence: dict[str, Any] = {
            "session_id": event.session_id,
            "user_id": event.user_id,
            "login_ip": event.ip,
            "pre_login_ips": list(pre_login_ips),
            "pre_login_event_count": len(pre_login_events),
            "pre_login_event_types": list(set(e.event_type for e in pre_login_events)),
            "time_before_login_seconds": round(
                (event.timestamp - min(e.timestamp for e in pre_login_events)).total_seconds(),
                1,
            ),
        }

        return self._create_alert(
            event,
            f"Possible Session Fixation for User {event.user_id}",
            (
                f"Session {event.session_id} was active from IP(s) "
                f"{', '.join(pre_login_ips)} before user {event.user_id} logged in "
                f"from IP {event.ip}. This may indicate session fixation attack."
            ),
            evidence,
            severity=Severity.HIGH,
            confidence=0.75,
        )