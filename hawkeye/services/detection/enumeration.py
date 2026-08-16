"""Enumeration detection - excessive 404s, directory traversal, etc."""

import re
from collections import Counter
from typing import Any

from sqlmodel import select

from hawkeye.config import settings
from hawkeye.models.enums import DetectionType, Severity
from hawkeye.models.events import Alert, NormalizedEvent
from hawkeye.services.detection.base import BaseDetector, DetectionContext


class EnumerationDetector(BaseDetector):
    """Detects enumeration attacks - excessive 404s, path traversal, etc."""

    name = "enumeration"
    detection_type = DetectionType.ENUMERATION
    default_severity = Severity.MEDIUM
    default_confidence = 0.7

    SUSPICIOUS_PATHS = [
        r"\.\.",  # Directory traversal
        r"/etc/passwd",
        r"/\.env",
        r"/wp-admin",
        r"/phpmyadmin",
        r"/admin/?$",
        r"/config",
        r"/backup",
        r"/\.git",
        r"/\.svn",
        r"/\.DS_Store",
        r"web\.config",
        r"phpinfo",
        r"eval\(",
        r"base64_decode",
        r"shell_exec",
        r"system\(",
        r"exec\(",
        r"passthru",
        r"/proc/self/environ",
        r"/proc/version",
        r"/etc/shadow",
    ]

    async def detect(self, context: DetectionContext) -> list[Alert]:
        """Detect enumeration patterns."""
        alerts = []

        # Check for 404 enumeration
        alert_404 = await self._check_404_enumeration(context)
        if alert_404:
            alerts.append(alert_404)

        # Check for suspicious path access
        alert_suspicious = await self._check_suspicious_paths(context)
        if alert_suspicious:
            alerts.append(alert_suspicious)

        # Check for parameter tampering
        alert_params = await self._check_parameter_tampering(context)
        if alert_params:
            alerts.append(alert_params)

        return alerts

    async def _check_404_enumeration(self, context: DetectionContext) -> Alert | None:
        """Check for excessive 404 errors from same IP."""
        event = context.event

        if event.status_code != 404:
            return None

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.status_code == 404,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        not_found_events = list(result.all())

        count = len(not_found_events)
        if count < settings.enumeration_404_threshold:
            return None

        # Check time window
        if not_found_events:
            earliest = min(e.timestamp for e in not_found_events)
            latest = max(e.timestamp for e in not_found_events)
            window_minutes = (latest - earliest).total_seconds() / 60

            if window_minutes > settings.enumeration_window_minutes:
                return None

        # Analyze paths accessed
        paths = [e.route for e in not_found_events if e.route]
        path_counts = Counter(paths)
        unique_paths = len(path_counts)

        evidence: dict[str, Any] = {
            "ip": event.ip,
            "total_404s": count,
            "unique_paths": unique_paths,
            "time_window_minutes": round(window_minutes, 1),
            "top_paths": path_counts.most_common(10),
            "user_agent": event.user_agent,
        }

        return self._create_alert(
            event,
            f"404 Enumeration Scan from {event.ip}",
            (
                f"Detected {count} 404 errors from IP {event.ip} across {unique_paths} "
                f"unique paths in {window_minutes:.1f} minutes. Consistent with "
                "directory/file enumeration."
            ),
            evidence,
        )

    async def _check_suspicious_paths(self, context: DetectionContext) -> Alert | None:
        """Check for access to suspicious/sensitive paths."""
        event = context.event

        if not event.route:
            return None

        route_lower = event.route.lower()
        matched_patterns = []

        for pattern in self.SUSPICIOUS_PATHS:
            if re.search(pattern, route_lower, re.IGNORECASE):
                matched_patterns.append(pattern)

        if not matched_patterns:
            return None

        # Check recent events from same IP for pattern
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        suspicious_count = 0
        for e in recent:
            if e.route:
                for pattern in self.SUSPICIOUS_PATHS:
                    if re.search(pattern, e.route.lower(), re.IGNORECASE):
                        suspicious_count += 1
                        break

        evidence: dict[str, Any] = {
            "ip": event.ip,
            "trigger_path": event.route,
            "matched_patterns": matched_patterns,
            "recent_suspicious_requests": suspicious_count,
            "total_recent_requests": len(recent),
            "user_agent": event.user_agent,
            "status_code": event.status_code,
        }

        severity = Severity.HIGH if suspicious_count > 5 else Severity.MEDIUM
        confidence = min(0.9, 0.5 + (suspicious_count * 0.05))

        return self._create_alert(
            event,
            f"Suspicious Path Access from {event.ip}",
            (
                f"IP {event.ip} accessed suspicious path: {event.route}. "
                f"Matched patterns: {', '.join(matched_patterns)}. "
                f"Total suspicious requests in window: {suspicious_count}."
            ),
            evidence,
            severity=severity,
            confidence=confidence,
        )

    async def _check_parameter_tampering(self, context: DetectionContext) -> Alert | None:
        """Check for parameter tampering / injection attempts."""
        event = context.event

        # Check metadata for query parameters, body params
        params = {}
        if event.event_metadata:
            params.update(event.event_metadata.get("query_params", {}))
            params.update(event.event_metadata.get("body_params", {}))

        if not params:
            return None

        injection_patterns = [
            r"(\bunion\b.*\bselect\b)|(\bselect\b.*\bunion\b)",  # SQL union
            r"(\bor\b\s+\d+\s*=\s*\d+)",  # OR 1=1
            r"(--|#|;|/\*|\*/)",  # SQL comments
            r"(<script|javascript:|on\w+\s*=)",  # XSS
            r"(\$\{|\#\{)",  # Template injection
            r"(\.\./|\.\.\\)",  # Path traversal
            r"(rm\s+-rf|wget|curl\s+-O)",  # Command injection
        ]

        matched = []
        for param_name, param_value in params.items():
            if isinstance(param_value, str):
                for pattern in injection_patterns:
                    if re.search(pattern, param_value, re.IGNORECASE):
                        matched.append({
                            "parameter": param_name,
                            "pattern": pattern,
                            "value": param_value[:100],
                        })

        if not matched:
            return None

        # Check if this IP has multiple injection attempts
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        injection_count = 0
        for e in recent:
            if e.event_metadata:
                p = e.event_metadata.get("query_params", {})
                p.update(e.event_metadata.get("body_params", {}))
                for pv in p.values():
                    if isinstance(pv, str):
                        for pattern in injection_patterns:
                            if re.search(pattern, pv, re.IGNORECASE):
                                injection_count += 1
                                break

        evidence: dict[str, Any] = {
            "ip": event.ip,
            "matched_injections": matched[:10],
            "total_injection_attempts_in_window": injection_count,
            "route": event.route,
            "method": event.method,
        }

        severity = Severity.CRITICAL if injection_count > 3 else Severity.HIGH
        confidence = min(0.95, 0.6 + (injection_count * 0.1))

        return self._create_alert(
            event,
            f"Parameter Tampering/Injection Attempt from {event.ip}",
            (
                f"Detected {len(matched)} injection pattern(s) in request parameters "
                f"from IP {event.ip}. "
                f"Total injection attempts in window: {injection_count}."
            ),
            evidence,
            severity=severity,
            confidence=confidence,
        )
