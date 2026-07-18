"""Bot detection module."""

import re
from collections import Counter
from datetime import datetime, timedelta

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.config import settings
from hawkeye.models.events import NormalizedEvent
from hawkeye.services.detection.base import Alert, DetectionContext, DetectorBase, Severity


class BotDetector(DetectorBase):
    """Detects automated/bot traffic."""

    DETECTION_TYPE = "bot_detection"
    DETECTOR_NAME = "BotDetector"

    # Known bot user agent patterns
    BOT_UA_PATTERNS = [
        r"bot",
        r"crawler",
        r"spider",
        r"scraper",
        r"curl",
        r"wget",
        r"python",
        r"java",
        r"go-http",
        r"apache-httpclient",
        r"okhttp",
        r"axios",
        r"postman",
        r"insomnia",
        r"httpie",
        r"scrapy",
        r"selenium",
        r"webdriver",
        r"phantomjs",
        r"headless",
        r"puppeteer",
        r"playwright",
        r"chromedriver",
        r"geckodriver",
    ]

    # Automation framework patterns
    AUTOMATION_PATTERNS = [
        r"webdriver",
        r"selenium",
        r"puppeteer",
        r"playwright",
        r"cypress",
        r"testcafe",
        r"webdriverio",
        r"nightwatch",
    ]

    async def detect(self, context: DetectionContext) -> list[Alert]:
        alerts = []

        event = context.event

        # Check user agent for bot signatures
        alert_ua = await self._check_user_agent(context)
        if alert_ua:
            alerts.append(alert_ua)

        # Check for headless browser indicators
        alert_headless = await self._check_headless_browser(context)
        if alert_headless:
            alerts.append(alert_headless)

        # Check for automation patterns
        alert_auto = await self._check_automation_patterns(context)
        if alert_auto:
            alerts.append(alert_auto)

        # Check for rate-based bot behavior
        alert_rate = await self._check_rate_patterns(context)
        if alert_rate:
            alerts.append(alert_rate)

        # Check for missing headers typical of bots
        alert_headers = await self._check_missing_headers(context)
        if alert_headers:
            alerts.append(alert_headers)

        return alerts

    def _analyze_user_agent(self, ua: str | None) -> dict:
        """Analyze user agent string for bot indicators."""
        if not ua:
            return {"is_bot": False, "confidence": 0.0, "reasons": []}

        ua_lower = ua.lower()
        reasons = []
        confidence = 0.0

        # Check known bot patterns
        for pattern in self.BOT_UA_PATTERNS:
            if re.search(pattern, ua_lower):
                reasons.append(f"ua_pattern:{pattern}")
                confidence += 0.15

        # Check for automation frameworks
        for pattern in self.AUTOMATION_PATTERNS:
            if re.search(pattern, ua_lower):
                reasons.append(f"automation:{pattern}")
                confidence += 0.3

        # Check for missing or suspicious UA
        if len(ua) < 20:
            reasons.append("ua_too_short")
            confidence += 0.2

        # Common browser patterns that should be present
        has_browser = any(
            b in ua_lower for b in ["mozilla", "chrome", "safari", "firefox", "edge", "webkit"]
        )
        if not has_browser and ua_lower not in ["", "-"]:
            reasons.append("no_browser_identifier")
            confidence += 0.2

        return {
            "is_bot": confidence >= settings.bot_detection_confidence_threshold,
            "confidence": min(confidence, 1.0),
            "reasons": reasons,
        }

    async def _check_user_agent(self, context: DetectionContext) -> Alert | None:
        """Check user agent for bot signatures."""
        event = context.event
        ua = event.user_agent
        analysis = self._analyze_user_agent(ua)

        if not analysis["is_bot"]:
            return None

        # Check recent events from same IP for consistency
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        # Count bot-like UAs in recent events
        bot_count = sum(
            1
            for e in recent
            if self._analyze_user_agent(e.user_agent)["is_bot"]
        )

        if bot_count < 2:  # Require at least some consistency
            pass  # Still alert but lower confidence

        evidence: dict = {
            "ip": event.ip,
            "user_agent": ua,
            "analysis": analysis,
            "recent_events_checked": len(recent),
            "bot_like_ua_count": bot_count,
        }

        return self._create_alert(
            event,
            f"Bot Traffic Detected from {event.ip}",
            (
                f"User agent analysis indicates automated traffic from IP {event.ip}. "
                f"Confidence: {analysis['confidence']:.0%}. "
                f"Reasons: {', '.join(analysis['reasons'])}"
            ),
            evidence,
            severity=Severity.MEDIUM,
            confidence=analysis["confidence"],
        )

    async def _check_headless_browser(self, context: DetectionContext) -> Alert | None:
        """Check for headless browser indicators from browser events."""
        event = context.event

        # Look for browser detection events
        if event.event_type not in {
            "headless_browser_detected",
            "devtools_detected",
            "automation_detected",
        }:
            return None

        evidence: dict = {
            "ip": event.ip,
            "event_type": event.event_type,
            "user_agent": event.user_agent,
            "event_metadata": event.event_metadata,
        }

        return self._create_alert(
            event,
            f"Headless Browser/Automation Detected from {event.ip}",
            (
                f"Browser security agent detected {event.event_type.replace('_', ' ')} "
                f"from IP {event.ip}. This indicates automated browser usage, "
                f"commonly used for scraping, testing, or attacks."
            ),
            evidence,
            severity=Severity.HIGH,
            confidence=0.9,
        )

    async def _check_automation_patterns(self, context: DetectionContext) -> Alert | None:
        """Check for automation patterns in request behavior."""
        event = context.event

        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        if len(recent) < 20:  # Need enough samples
            return None

        # Check for perfectly regular intervals (bot-like timing)
        timestamps = sorted(e.timestamp for e in recent)
        intervals = [
            (timestamps[i + 1] - timestamps[i]).total_seconds()
            for i in range(len(timestamps) - 1)
        ]

        if not intervals:
            return None

        # Calculate variance - bots often have very low variance
        import statistics
        try:
            variance = statistics.variance(intervals)
            mean_interval = statistics.mean(intervals)
        except statistics.StatisticsError:
            return None

        # Very low variance + regular intervals = bot
        if variance < 0.5 and mean_interval > 0:
            cv = (variance**0.5) / mean_interval if mean_interval > 0 else 1
            if cv < 0.1:  # Coefficient of variation very low
                evidence: dict = {
                    "ip": event.ip,
                    "request_count": len(recent),
                    "mean_interval_seconds": round(mean_interval, 2),
                    "interval_variance": round(variance, 4),
                    "coefficient_of_variation": round(cv, 4),
                    "time_window_minutes": settings.correlation_time_window_hours * 60,
                }

                return self._create_alert(
                    event,
                    f"Automated Request Pattern from {event.ip}",
                    (
                        f"Detected highly regular request intervals from IP {event.ip} "
                        f"(mean: {mean_interval:.1f}s, CV: {cv:.3f}). "
                        f"Pattern consistent with automated/scripted traffic."
                    ),
                    evidence,
                    severity=Severity.MEDIUM,
                    confidence=0.75,
                )

        return None

    async def _check_rate_patterns(self, context: DetectionContext) -> Alert | None:
        """Check for high-rate bot-like request patterns."""
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

        # Calculate requests per minute
        earliest = min(e.timestamp for e in recent)
        latest = max(e.timestamp for e in recent)
        window_minutes = (latest - earliest).total_seconds() / 60

        if window_minutes <= 0:
            return None

        rpm = len(recent) / window_minutes

        if rpm < settings.api_abuse_rpm_threshold:
            return None

        evidence: dict = {
            "ip": event.ip,
            "requests_per_minute": round(rpm, 1),
            "total_requests": len(recent),
            "time_window_minutes": round(window_minutes, 1),
            "unique_routes": len(set(e.route for e in recent if e.route)),
            "user_agent": event.user_agent,
        }

        return self._create_alert(
            event,
            f"High-Rate Automated Traffic from {event.ip}",
            (
                f"IP {event.ip} made {len(recent)} requests in {window_minutes:.1f} minutes "
                f"({rpm:.1f} RPM), exceeding threshold of {settings.api_abuse_rpm_threshold} RPM. "
                f"Likely automated scraping or API abuse."
            ),
            evidence,
            severity=Severity.HIGH if rpm > settings.api_abuse_rpm_threshold * 2 else Severity.MEDIUM,
            confidence=min(0.9, rpm / (settings.api_abuse_rpm_threshold * 3)),
        )

    async def _check_missing_headers(self, context: DetectionContext) -> Alert | None:
        """Check for missing browser headers typical of bots."""
        event = context.event

        # This would check headers stored in metadata
        headers = event.event_metadata.get("headers", {}) if event.event_metadata else {}

        # Essential browser headers
        required_headers = [
            "accept",
            "accept-language",
            "accept-encoding",
            "user-agent",
        ]

        missing = [h for h in required_headers if h not in headers]

        if len(missing) < 2:  # Allow some missing
            return None

        # Verify this is consistent across recent requests
        stmt = select(NormalizedEvent).where(
            NormalizedEvent.source_id == event.source_id,
            NormalizedEvent.ip == event.ip,
            NormalizedEvent.timestamp >= context.time_window_start,
        )
        result = await context.session.exec(stmt)
        recent = list(result.all())

        consistent_missing = 0
        for e in recent:
            h = e.event_metadata.get("headers", {}) if e.event_metadata else {}
            if all(m not in h for m in missing):
                consistent_missing += 1

        if consistent_missing < len(recent) * 0.8:  # 80% consistency
            return None

        evidence: dict = {
            "ip": event.ip,
            "consistently_missing_headers": missing,
            "requests_analyzed": len(recent),
            "consistency_ratio": round(consistent_missing / len(recent), 2),
            "user_agent": event.user_agent,
        }

        return self._create_alert(
            event,
            f"Missing Browser Headers from {event.ip}",
            (
                f"Requests from IP {event.ip} consistently missing standard browser headers: "
                f"{', '.join(missing)}. Indicates non-browser client or scraper."
            ),
            evidence,
            severity=Severity.MEDIUM,
            confidence=0.7,
        )