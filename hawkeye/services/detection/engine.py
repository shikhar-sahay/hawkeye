"""Detection engine - orchestrates all detectors."""

import logging

from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.api.websocket import connection_manager
from hawkeye.models.events import Alert, NormalizedEvent
from hawkeye.services.correlation.engine import CorrelationEngine
from hawkeye.services.detection.api_abuse import APIAbuseDetector
from hawkeye.services.detection.base import DetectionContext
from hawkeye.services.detection.bot import BotDetector
from hawkeye.services.detection.brute_force import BruteForceDetector
from hawkeye.services.detection.credential_stuffing import CredentialStuffingDetector
from hawkeye.services.detection.enumeration import EnumerationDetector
from hawkeye.services.detection.sensitive_actions import SensitiveActionDetector
from hawkeye.services.detection.session_hijacking import SessionHijackingDetector

logger = logging.getLogger(__name__)


class DetectionEngine:
    """Main detection engine that runs all detectors on events."""

    def __init__(self) -> None:
        self.detectors = [
            BruteForceDetector(),
            CredentialStuffingDetector(),
            EnumerationDetector(),
            BotDetector(),
            SensitiveActionDetector(),
            SessionHijackingDetector(),
            APIAbuseDetector(),
        ]

    async def process_event(self, session: AsyncSession, event: NormalizedEvent) -> None:
        """Run all detectors on an event and correlate alerts."""
        context = DetectionContext(
            session=session,
            event=event,
        )

        all_alerts = []
        for detector in self.detectors:
            try:
                alerts = await detector.detect(context)
                all_alerts.extend(alerts)
            except Exception:
                # Log error but continue with other detectors
                logger.exception("Detector %s failed", detector.name)

        if all_alerts:
            # Save alerts
            session.add_all(all_alerts)
            await session.flush()

            # Correlate alerts into incidents
            correlation_engine = CorrelationEngine(session)
            for alert in all_alerts:
                await correlation_engine.correlate_alert(alert)

            await session.commit()

            # Broadcast alerts via WebSocket
            for alert in all_alerts:
                await self._broadcast_alert(alert, event.source_id)

    async def _broadcast_alert(self, alert: Alert, source_id: int) -> None:
        """Broadcast a newly created alert to WebSocket subscribers."""
        try:
            alert_data = {
                "id": alert.id,
                "source_id": alert.source_id,
                "event_id": alert.event_id,
                "detection_type": alert.detection_type,
                "detector_name": alert.detector_name,
                "severity": alert.severity,
                "title": alert.title,
                "description": alert.description,
                "evidence": alert.evidence,
                "confidence": alert.confidence,
                "status": alert.status,
                "created_at": alert.created_at.isoformat() + "Z" if alert.created_at else None,
            }
            sent = await connection_manager.broadcast_alert(alert_data, source_id)
            if sent > 0:
                logger.debug("Broadcast alert %s to %d WebSocket connections", alert.id, sent)
        except Exception as e:
            # Don't fail detection if broadcast fails
            logger.warning("Failed to broadcast alert %s: %s", alert.id, e)
