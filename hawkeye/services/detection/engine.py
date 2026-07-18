"""Detection engine - orchestrates all detectors."""

from sqlmodel.ext.asyncio.session import AsyncSession

from hawkeye.models.events import NormalizedEvent
from hawkeye.services.correlation.engine import CorrelationEngine
from hawkeye.services.detection import (
    APIAbuseDetector,
    BotDetector,
    BruteForceDetector,
    CredentialStuffingDetector,
    EnumerationDetector,
    SensitiveActionDetector,
    SessionHijackingDetector,
)
from hawkeye.services.detection.base import DetectionContext


class DetectionEngine:
    """Main detection engine that runs all detectors on events."""

    def __init__(self):
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
            except Exception as e:
                # Log error but continue with other detectors
                import logging
                logging.error(f"Detector {detector.name} failed: {e}")

        if all_alerts:
            # Save alerts
            session.add_all(all_alerts)
            await session.flush()

            # Correlate alerts into incidents
            correlation_engine = CorrelationEngine(session)
            for alert in all_alerts:
                await correlation_engine.correlate_alert(alert)

            await session.commit()