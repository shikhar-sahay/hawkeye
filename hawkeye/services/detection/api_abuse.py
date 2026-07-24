"""API abuse detection - rate limiting, scraping, etc."""

from collections import defaultdict
from typing import Any

from sqlmodel import select

from hawkeye.config import settings
from hawkeye.models.enums import DetectionType, Severity
from hawkeye.models.events import Alert, NormalizedEvent
from hawkeye.services.detection.base import BaseDetector, DetectionContext


class APIAbuseDetector(BaseDetector):
    """Detects API abuse - excessive rates, scraping, parameter enumeration."""

    name = "api_abuse"
    detection_type = DetectionType.API_ABUSE
    default_severity = Severity.MEDIUM
    default_confidence = 0.7

    async def detect(self, context: DetectionContext) -> list[Alert]:
        """Detect API abuse patterns."""
        alerts = []

        # Check for high request rate
        alert_rate = await self._check_high_rate(context)
        if alert_rate:
            alerts.append(alert_rate)

        # Check for API endpoint enumeration
        alert_enum = await self._check_endpoint_enumeration(context)
        if alert_enum:
            alerts.append(alert_enum)

        # Check for parameter fuzzing
        alert_fuzz = await self._check_parameter_fuzzing(context)
        if alert_fuzz:
            alerts.append(alert_fuzz)

        # Check for auth bypass attempts
        alert_auth = await self._check_auth_bypass(context)
        if alert_auth:
            alerts.append(alert_auth)

        return alerts

    async def _check_high_rate(self, context: DetectionContext) -> Alert | None:
        """Check for excessive request rates."""
        event = context.event

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        if len(recent) < settings.api_abuse_rpm_threshold:
            return None

        earliest = min(e.timestamp for e in recent)
        latest = max(e.timestamp for e in recent)
        window_minutes = (latest - earliest).total_seconds() / 60

        if window_minutes <= 0:
            return None

        rpm = len(recent) / window_minutes

        if rpm < settings.api_abuse_rpm_threshold:
            return None

        # Analyze request patterns
        routes = [e.route for e in recent if e.route]
        methods = [e.method for e in recent if e.method]
        status_codes = [e.status_code for e in recent if e.status_code]

        from collections import Counter
        route_counts = Counter(routes)
        method_counts = Counter(methods)
        status_counts = Counter(status_codes)

        error_rate = sum(c for s, c in status_counts.items() if s and s >= 400) / len(recent)

        evidence: dict[str, Any] = {
            "ip": event.ip,
            "requests_per_minute": round(rpm, 1),
            "total_requests": len(recent),
            "time_window_minutes": round(window_minutes, 1),
            "unique_endpoints": len(route_counts),
            "top_endpoints": route_counts.most_common(10),
            "methods": dict(method_counts),
            "status_codes": dict(status_counts),
            "error_rate": round(error_rate, 2),
            "user_agent": event.user_agent,
        }

        severity = Severity.HIGH if rpm > settings.api_abuse_rpm_threshold * 3 else Severity.MEDIUM
        confidence = min(0.9, rpm / (settings.api_abuse_rpm_threshold * 2))

        return self._create_alert(
            event,
            f"High-Rate API Access from {event.ip}",
            (
                f"IP {event.ip} made {len(recent)} requests in {window_minutes:.1f} minutes "
                f"({rpm:.1f} RPM), exceeding threshold of {settings.api_abuse_rpm_threshold} RPM. "
                f"Error rate: {error_rate:.1%}. Possible API abuse or scraping."
            ),
            evidence,
            severity=severity,
            confidence=confidence,
        )

    async def _check_endpoint_enumeration(self, context: DetectionContext) -> Alert | None:
        """Check for systematic API endpoint enumeration."""
        event = context.event

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        routes = [e.route for e in recent if e.route]
        unique_routes = set(routes)

        # Need many unique routes but relatively few requests per route
        if len(unique_routes) < 20:
            return None

        avg_requests_per_route = len(routes) / len(unique_routes)

        # If avg requests per route is very low (e.g., < 1.5), it's enumeration
        if avg_requests_per_route > 2:
            return None

        # Check for sequential patterns (e.g., /api/v1/users/1, /api/v1/users/2...)
        route_paths = list(unique_routes)
        sequential_score = self._check_sequential_paths(route_paths)

        evidence: dict[str, Any] = {
            "ip": event.ip,
            "total_requests": len(recent),
            "unique_endpoints": len(unique_routes),
            "avg_requests_per_endpoint": round(avg_requests_per_route, 2),
            "sequential_pattern_score": sequential_score,
            "sample_endpoints": list(unique_routes)[:20],
            "user_agent": event.user_agent,
        }

        return self._create_alert(
            event,
            f"API Endpoint Enumeration from {event.ip}",
            (
                f"IP {event.ip} accessed {len(unique_routes)} unique API endpoints "
                f"with only {avg_requests_per_route:.1f} requests per endpoint on average. "
                f"Sequential pattern score: {sequential_score:.2f}. "
                f"Indicates systematic API discovery/enumeration."
            ),
            evidence,
            severity=Severity.MEDIUM,
            confidence=0.75,
        )

    def _check_sequential_paths(self, paths: list[str]) -> float:
        """Check for sequential path patterns (e.g., /api/users/1, /api/users/2)."""
        import re

        # Extract numeric IDs from paths
        path_groups = defaultdict(list)
        for path in paths:
            # Find numeric segments
            nums = re.findall(r"/(\d+)(?:/|$)", path)
            for n in nums:
                base = path.replace(f"/{n}", "/{id}")
                path_groups[base].append(int(n))

        max_sequence = 0
        for base, numbers in path_groups.items():
            if len(numbers) < 3:
                continue
            numbers.sort()
            # Check for consecutive sequences
            seq_len = 1
            max_seq = 1
            for i in range(1, len(numbers)):
                if numbers[i] == numbers[i - 1] + 1:
                    seq_len += 1
                    max_seq = max(max_seq, seq_len)
                else:
                    seq_len = 1
            max_sequence = max(max_sequence, max_seq)

        return min(max_sequence / 10.0, 1.0)  # Normalize to 0-1

    async def _check_parameter_fuzzing(self, context: DetectionContext) -> Alert | None:
        """Check for parameter fuzzing - many variations of same endpoint."""
        event = context.event

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        if len(recent) < 50:
            return None

        # Group by base route (without query params)
        route_groups = defaultdict(list)
        for e in recent:
            if e.route:
                base = e.route.split("?")[0]
                route_groups[base].append(e)

        # Find routes with many requests but different parameters
        for base_route, events in route_groups.items():
            if len(events) < 20:
                continue

            # Check metadata for query params
            param_variations = set()
            for e in events:
                if e.event_metadata and "query_params" in e.event_metadata:
                    params = e.event_metadata["query_params"]
                    if isinstance(params, dict):
                        param_variations.add(tuple(sorted(params.keys())))

            if len(param_variations) > 10:
                evidence: dict[str, Any] = {
                    "ip": event.ip,
                    "base_route": base_route,
                    "total_requests": len(events),
                    "unique_param_combinations": len(param_variations),
                    "sample_params": list(param_variations)[:10],
                    "user_agent": event.user_agent,
                }

                return self._create_alert(
                    event,
                    f"Parameter Fuzzing on {base_route} from {event.ip}",
                    (
                        f"IP {event.ip} made {len(events)} requests to {base_route} "
                        f"with {len(param_variations)} unique parameter combinations. "
                        f"Indicates parameter fuzzing or API exploration."
                    ),
                    evidence,
                    severity=Severity.MEDIUM,
                    confidence=0.7,
                )

        return None

    async def _check_auth_bypass(self, context: DetectionContext) -> Alert | None:
        """Check for authentication bypass attempts."""
        event = context.event

        # Look for 401/403 followed by success on same endpoint
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.route == event.route,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        if len(recent) < 5:
            return None

        # Check for pattern: multiple 401/403 then 200
        auth_failures = [e for e in recent if e.status_code in (401, 403)]
        auth_success = [e for e in recent if e.status_code == 200]

        if len(auth_failures) < 3 or not auth_success:
            return None

        # Check if success came after failures
        latest_failure = max(e.timestamp for e in auth_failures)
        earliest_success = min(e.timestamp for e in auth_success)

        if earliest_success > latest_failure:
            time_diff = (earliest_success - latest_failure).total_seconds()

            evidence: dict[str, Any] = {
                "ip": event.ip,
                "route": event.route,
                "auth_failures": len(auth_failures),
                "auth_successes": len(auth_success),
                "time_between_failure_and_success_seconds": time_diff,
                "failure_codes": [e.status_code for e in auth_failures],
                "user_agent": event.user_agent,
            }

            return self._create_alert(
                event,
                f"Possible Auth Bypass on {event.route} from {event.ip}",
                (
                    f"IP {event.ip} had {len(auth_failures)} authentication failures (401/403) "
                    f"followed by successful access (200) on {event.route} "
                    f"within {time_diff:.0f} seconds. Possible auth bypass or credential guessing."
                ),
                evidence,
                severity=Severity.HIGH,
                confidence=0.8,
            )

        return None
